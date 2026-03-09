const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const storage = require('./storage');
const logger = require('./logger');

class AdminAuth {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24小时
    this.loginAttempts = new Map();
    this.maxAttempts = 5;
    this.lockoutDuration = 15 * 60 * 1000; // 15分钟
  }

  async initDefaultAdmin() {
    const admins = storage.loadAdmins();
    if (admins.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const admin = {
        username: 'admin',
        passwordHash,
        createdAt: Date.now(),
        lastLogin: null
      };
      storage.saveAdmin(admin);
      logger.info('Default admin account created');
    }
  }

  async authenticate(username, password, ip) {
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return null;
    }

    if (username.length > 50 || password.length > 100) {
      return null;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return null;
    }

    const attemptKey = `${ip}-${username}`;
    const attempts = this.loginAttempts.get(attemptKey);
    if (attempts && attempts.count >= this.maxAttempts) {
      if (Date.now() - attempts.lastAttempt < this.lockoutDuration) {
        logger.warn(`Login locked out: ${username} from ${ip}`);
        return null;
      } else {
        this.loginAttempts.delete(attemptKey);
      }
    }

    const admin = storage.getAdminByUsername(username);
    if (!admin) {
      this.recordFailedAttempt(attemptKey);
      return null;
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      this.recordFailedAttempt(attemptKey);
      return null;
    }

    this.loginAttempts.delete(attemptKey);
    const sessionId = crypto.randomBytes(32).toString('hex');
    this.sessions.set(sessionId, {
      username,
      expiry: Date.now() + this.sessionTimeout
    });

    storage.updateAdminLastLogin(username);
    logger.info(`Admin logged in: ${username}`);
    return sessionId;
  }

  recordFailedAttempt(attemptKey) {
    const attempts = this.loginAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(attemptKey, attempts);
  }

  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiry) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session.username;
  }

  logout(sessionId) {
    this.sessions.delete(sessionId);
  }

  async createAdmin(username, password, createdBy) {
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      throw new Error('用户名和密码不能为空');
    }

    if (username.length > 50 || password.length > 100) {
      throw new Error('用户名或密码长度超出限制');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error('用户名只能包含字母、数字、下划线和连字符');
    }

    const existingAdmin = storage.getAdminByUsername(username);
    if (existingAdmin) {
      throw new Error('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = {
      username,
      passwordHash,
      createdAt: Date.now(),
      createdBy,
      lastLogin: null
    };

    storage.saveAdmin(admin);
    logger.info(`Admin account created: ${username} by ${createdBy}`);
    return { username, createdAt: admin.createdAt };
  }

  async changePassword(targetUsername, newPassword, currentUsername) {
    if (!newPassword || typeof newPassword !== 'string') {
      throw new Error('新密码不能为空');
    }

    if (newPassword.length > 100 || newPassword.length < 6) {
      throw new Error('密码长度必须在6-100个字符之间');
    }

    const targetAdmin = storage.getAdminByUsername(targetUsername);
    if (!targetAdmin) {
      throw new Error('目标账户不存在');
    }

    // 权限检查：只有admin可以修改其他账户密码，其他账户只能修改自己的密码
    if (currentUsername !== 'admin' && currentUsername !== targetUsername) {
      throw new Error('无权修改其他账户的密码');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    storage.updateAdminPassword(targetUsername, passwordHash);
    logger.info(`Password changed for ${targetUsername} by ${currentUsername}`);
  }

  getAllAdmins() {
    return storage.loadAdmins().map(admin => ({
      username: admin.username,
      createdAt: admin.createdAt,
      createdBy: admin.createdBy,
      lastLogin: admin.lastLogin
    }));
  }

  async deleteAdmin(targetUsername, currentUsername) {
    if (targetUsername === 'admin') {
      throw new Error('不能删除admin账户');
    }

    if (currentUsername !== 'admin') {
      throw new Error('只有admin可以删除账户');
    }

    const targetAdmin = storage.getAdminByUsername(targetUsername);
    if (!targetAdmin) {
      throw new Error('目标账户不存在');
    }

    storage.deleteAdmin(targetUsername);
    logger.info(`Admin account deleted: ${targetUsername} by ${currentUsername}`);
  }
}

module.exports = AdminAuth;
