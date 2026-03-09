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
}

module.exports = AdminAuth;
