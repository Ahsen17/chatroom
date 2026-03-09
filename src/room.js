const UserManager = require('./userManager');
const MessageHandler = require('./messageHandler');
const logger = require('./logger');

class Room {
  constructor(roomId, name, maxUsers = 20) {
    this.roomId = roomId;
    this.name = name;
    this.maxUsers = maxUsers;
    this.userManager = new UserManager(roomId, maxUsers);
    this.messageHandler = new MessageHandler(roomId);
    this.clients = new Map();
  }

  addClient(ip, ws) {
    const oldWs = this.clients.get(ip);
    if (oldWs && oldWs.readyState === 1) {
      oldWs.send(JSON.stringify({type: 'kicked', message: '您的账号在其他地方登录'}));
      oldWs.close();
    }
    this.clients.set(ip, ws);
  }

  removeClient(ip) {
    this.clients.delete(ip);
  }

  broadcast(message, excludeIP = null) {
    const data = JSON.stringify(message);
    this.clients.forEach((ws, ip) => {
      if (ip !== excludeIP && ws.readyState === 1) {
        ws.send(data);
      }
    });
  }

  handleJoin(ip, nickname, ws) {
    const user = this.userManager.addUser(ip, nickname);
    if (!user) {
      return {error: '聊天室已满'};
    }

    const history = this.messageHandler.getRecentMessages(10);
    const onlineCount = this.userManager.getOnlineCount();

    this.broadcast({type: 'user_joined', user, onlineCount}, ip);

    return {user, history, onlineCount};
  }

  handleLeave(ip) {
    const user = this.userManager.removeUser(ip);
    if (user) {
      const onlineCount = this.userManager.getOnlineCount();
      this.broadcast({type: 'user_left', nickname: user.nickname, onlineCount});
      logger.info(`User left room ${this.roomId}: ${user.nickname}`);
    }
    this.removeClient(ip);
  }

  getOnlineCount() {
    return this.userManager.getOnlineCount();
  }
}

module.exports = Room;
