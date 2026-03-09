const WebSocket = require('ws');
const userManager = require('./userManager');
const messageHandler = require('./messageHandler');
const logger = require('./logger');
const Encryption = require('./encryption');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.heartbeatInterval = 30000;
    this.sessionKeys = new Map();
    this.mockIPPool = new Map();
    this.mockIPCounter = 1;
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, req) => {
      const ip = this.getClientIP(req);

      if (!userManager.canAddUser()) {
        ws.send(JSON.stringify({ type: 'error', message: '聊天室已满（20/20）' }));
        ws.close();
        return;
      }

      this.handleConnection(ws, ip);
    });
  }

  getClientIP(req) {
    const rawIP = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.socket.remoteAddress;
    return this.normalizeIP(rawIP);
  }

  normalizeIP(ip) {
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
      const normalized = '127.0.0.1';
      const isLocalhost = true;

      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCALHOST !== 'true') {
        return 'BANNED_LOCALHOST';
      }

      if (process.env.NODE_ENV === 'development') {
        if (!this.mockIPPool.has(ip)) {
          this.mockIPPool.set(ip, `192.168.1.${this.mockIPCounter++}`);
        }
        return this.mockIPPool.get(ip);
      }

      return normalized;
    }
    return ip;
  }

  handleConnection(ws, ip) {
    if (ip === 'BANNED_LOCALHOST') {
      ws.send(JSON.stringify({ type: 'error', message: '生产环境不允许localhost连接' }));
      ws.close();
      return;
    }

    if (this.clients.has(ip)) {
      const oldWs = this.clients.get(ip);
      const oldState = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][oldWs.readyState];
      logger.info(`检测到重复连接 ${ip}，旧连接状态: ${oldState}`);

      // 只有当旧连接仍然处于打开状态时才踢掉
      if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
        logger.info(`踢掉旧连接: ${ip}`);
        oldWs.send(JSON.stringify({ type: 'kicked', message: '您的账号在另一处登录' }));
        oldWs.close();
      }
      this.clients.delete(ip);
    }

    logger.info(`新用户连接: ${ip}`);

    const sessionKey = Encryption.generateKey();
    this.sessionKeys.set(ip, sessionKey);

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data);
        this.handleMessage(ws, ip, payload);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ip);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket错误 (${ip}): ${error.message}`);
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.isAlive = true;
    this.clients.set(ip, ws);
    this.startHeartbeat(ws);
  }

  handleMessage(ws, ip, payload) {
    const { type, content, nickname, beforeTimestamp } = payload;

    logger.info(`收到消息: IP=${ip}, type=${type}`);

    if (type === 'check_history') {
      const storage = require('./storage');
      const existingUser = storage.getUserByIP(ip);
      logger.info(`历史检查: IP=${ip}, 有历史=${!!existingUser}`);
      ws.send(JSON.stringify({
        type: 'history_check',
        hasHistory: !!existingUser,
        user: existingUser
      }));
      return;
    }

    if (type === 'join') {
      logger.info(`用户加入请求: IP=${ip}, nickname=${nickname}`);
      const user = userManager.addUser(ip, nickname);
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', message: '无法加入聊天室' }));
        return;
      }

      logger.info(`用户加入成功: ${user.nickname} (${ip})`);
      const sessionKey = this.sessionKeys.get(ip);
      ws.send(JSON.stringify({
        type: 'welcome',
        user,
        sessionKey,
        history: messageHandler.loadHistory(),
        onlineCount: userManager.getOnlineCount()
      }));

      this.broadcast({
        type: 'user_joined',
        user: { nickname: user.nickname, avatar: user.avatar },
        onlineCount: userManager.getOnlineCount()
      }, ip);

      return;
    }

    if (type === 'load_more') {
      const messages = messageHandler.loadMoreMessages(beforeTimestamp);
      ws.send(JSON.stringify({
        type: 'history_loaded',
        messages
      }));
      return;
    }

    const user = userManager.getUser(ip);
    if (!user) {
      logger.warn(`未找到用户: IP=${ip}, type=${type}`);
      ws.send(JSON.stringify({ type: 'error', message: '请先加入聊天室' }));
      return;
    }

    if (type === 'text' || type === 'image') {
      try {
        // 支持明文和加密两种格式
        let decryptedContent;
        if (typeof content === 'string') {
          // 明文格式
          decryptedContent = content;
        } else if (content.encrypted) {
          // 加密格式
          const sessionKey = this.sessionKeys.get(ip);
          decryptedContent = Encryption.decrypt(content.data, sessionKey);
        } else {
          // 旧格式兼容
          decryptedContent = content.data || content;
        }

        const message = messageHandler.validateAndProcess(type, decryptedContent, user, ip);
        userManager.updateActivity(ip);

        // 广播消息（不加密）
        this.clients.forEach((client, clientIP) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      } catch (error) {
        logger.error(`消息处理错误: ${error.message}`);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    }
  }

  handleDisconnect(ip) {
    const user = userManager.getUser(ip);
    const hasClient = this.clients.has(ip);

    logger.info(`连接断开: ${ip}, 有用户: ${!!user}, 在clients中: ${hasClient}`);

    if (user) {
      logger.info(`用户断开: ${user.nickname} (${ip})`);
      userManager.removeUser(ip);

      this.broadcast({
        type: 'user_left',
        user: { nickname: user.nickname },
        onlineCount: userManager.getOnlineCount()
      });
    }

    this.clients.delete(ip);
    this.sessionKeys.delete(ip);
  }

  broadcast(message, excludeIP = null) {
    const data = JSON.stringify(message);

    this.clients.forEach((client, ip) => {
      if (ip !== excludeIP && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  startHeartbeat(ws) {
    const interval = setInterval(() => {
      if (!ws.isAlive) {
        clearInterval(interval);
        ws.terminate();
        return;
      }

      ws.isAlive = false;
      ws.ping();
    }, this.heartbeatInterval);

    ws.on('close', () => clearInterval(interval));
  }
}

module.exports = new WebSocketServer();
