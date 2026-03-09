const security = require('./security');
const storage = require('./storage');

class MessageHandler {
  constructor(roomId) {
    this.roomId = roomId;
  }

  createMessage(type, content, sender) {
    const message = {
      type,
      content: type === 'text' ? security.escapeHtml(content) : content,
      sender: {
        nickname: sender.nickname,
        avatar: sender.avatar
      },
      timestamp: Date.now(),
      messageId: this.generateId()
    };

    return message;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  validateAndProcess(type, content, sender, ip) {
    if (!security.checkRateLimit(ip)) {
      throw new Error('发送消息过于频繁，请稍后再试');
    }

    if (!security.validateMessage(type, content)) {
      throw new Error('消息格式无效');
    }

    const message = this.createMessage(type, content, sender);
    storage.saveMessage(message, this.roomId);

    return message;
  }

  loadHistory(count = 20) {
    return storage.loadRecentMessages(count, this.roomId);
  }

  loadMoreMessages(beforeTimestamp, count = 20) {
    return storage.loadRecentMessages(count, this.roomId, beforeTimestamp);
  }

  getMessagesSince(timestamp) {
    return storage.getMessagesSince(timestamp, this.roomId);
  }

  getRecentMessages(count = 50) {
    return storage.loadRecentMessages(count, this.roomId);
  }
}

module.exports = MessageHandler;
