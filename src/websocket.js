const WebSocket = require('ws');
const logger = require('./logger');
const Encryption = require('./encryption');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.roomManager = null;
    this.pendingConnections = new Map();
    this.heartbeatInterval = 30000;
  }

  initialize(server, roomManager) {
    this.wss = new WebSocket.Server({ server });
    this.roomManager = roomManager;

    this.wss.on('connection', (ws, req) => {
      const ip = this.getClientIP(req);
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
      return '127.0.0.1';
    }
    return ip;
  }

  handleConnection(ws, ip) {
    logger.info(`New connection: ${ip}`);
    this.pendingConnections.set(ip, ws);

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data);
        this.handleMessage(ws, ip, payload);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws, ip);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error (${ip}): ${error.message}`);
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.isAlive = true;
    this.startHeartbeat(ws);
  }

  handleMessage(ws, ip, payload) {
    const { type } = payload;

    if (type === 'verify_invite') {
      this.handleInviteVerification(ws, ip, payload.inviteCode);
      return;
    }

    if (!ws.roomId) {
      ws.send(JSON.stringify({ type: 'error', message: '请先验证邀请码' }));
      return;
    }

    const room = this.roomManager.getRoomByInviteCode(ws.roomId);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: '聊天室不存在' }));
      return;
    }

    this.handleRoomMessage(ws, ip, room, payload);
  }

  handleInviteVerification(ws, ip, inviteCode) {
    if (!inviteCode) {
      ws.send(JSON.stringify({ type: 'error', message: '邀请码不能为空' }));
      return;
    }

    const room = this.roomManager.getRoomByInviteCode(inviteCode);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: '无效的邀请码' }));
      return;
    }

    if (room.getOnlineCount() >= room.maxUsers) {
      ws.send(JSON.stringify({ type: 'error', message: '聊天室已满' }));
      return;
    }

    ws.roomId = room.roomId;
    this.pendingConnections.delete(ip);
    room.addClient(ip, ws);

    logger.info(`Invite verified: ${ip} -> room ${room.roomId}`);
    ws.send(JSON.stringify({
      type: 'invite_verified',
      roomId: room.roomId,
      roomName: room.name
    }));
  }

  handleRoomMessage(ws, ip, room, payload) {
    const { type, content, nickname } = payload;

    if (type === 'check_history') {
      const storage = require('./storage');
      const existingUser = storage.getUserByIP(ip, room.roomId);
      ws.send(JSON.stringify({
        type: 'history_check',
        hasHistory: !!existingUser,
        user: existingUser
      }));
      return;
    }

    if (type === 'join') {
      const result = room.handleJoin(ip, nickname, ws);
      if (result.error) {
        ws.send(JSON.stringify({ type: 'error', message: result.error }));
        return;
      }

      ws.send(JSON.stringify({
        type: 'welcome',
        user: result.user,
        history: result.history,
        onlineCount: result.onlineCount,
        maxUsers: room.maxUsers
      }));
      return;
    }

    const user = room.userManager.getUser(ip);
    if (!user) {
      ws.send(JSON.stringify({ type: 'error', message: '请先加入聊天室' }));
      return;
    }

    if (type === 'text' || type === 'image') {
      try {
        const message = room.messageHandler.validateAndProcess(type, content, user, ip);
        room.userManager.updateActivity(ip);
        room.broadcast(message);
      } catch (error) {
        logger.error(`Message error: ${error.message}`);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
      return;
    }

    if (type === 'load_more') {
      try {
        const messages = room.messageHandler.loadMoreMessages(payload.beforeTimestamp, 20);
        ws.send(JSON.stringify({ type: 'history_loaded', messages }));
      } catch (error) {
        logger.error(`Load more error: ${error.message}`);
        ws.send(JSON.stringify({ type: 'error', message: '加载失败' }));
      }
    }
  }

  handleDisconnect(ws, ip) {
    if (ws.roomId) {
      const room = this.roomManager.getRoomByInviteCode(ws.roomId);
      if (room) {
        room.handleLeave(ip);
      }
    }
    this.pendingConnections.delete(ip);
    logger.info(`Connection closed: ${ip}`);
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

