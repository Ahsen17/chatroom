const fs = require('fs');
const path = require('path');

class Storage {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.messagesDir = path.join(this.dataDir, 'messages');
    this.usersFile = path.join(this.dataDir, 'users.jsonl');
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.messagesDir)) {
      fs.mkdirSync(this.messagesDir, { recursive: true });
    }
    if (!fs.existsSync(this.usersFile)) {
      fs.writeFileSync(this.usersFile, '');
    }
  }

  getTodayFileName() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.messagesDir, `${today}.jsonl`);
  }

  saveMessage(message) {
    const fileName = this.getTodayFileName();
    const line = JSON.stringify(message) + '\n';
    fs.appendFileSync(fileName, line);
  }

  loadRecentMessages(count = 50) {
    const fileName = this.getTodayFileName();
    if (!fs.existsSync(fileName)) {
      return [];
    }

    const content = fs.readFileSync(fileName, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    const messages = lines.map(line => JSON.parse(line));
    return messages.slice(-count);
  }

  saveUser(userInfo) {
    const line = JSON.stringify(userInfo) + '\n';
    fs.appendFileSync(this.usersFile, line);
  }

  loadUsers() {
    if (!fs.existsSync(this.usersFile)) {
      return [];
    }

    const content = fs.readFileSync(this.usersFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    return lines.map(line => JSON.parse(line));
  }

  getUserByIP(ip) {
    const users = this.loadUsers();
    return users.find(user => user.ip === ip);
  }
}

module.exports = new Storage();
