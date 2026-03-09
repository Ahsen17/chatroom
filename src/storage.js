const fs = require('fs');
const path = require('path');

class Storage {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.messagesDir = path.join(this.dataDir, 'messages');
    this.imagesDir = path.join(this.dataDir, 'images');
    this.usersDir = path.join(this.dataDir, 'users');
    this.roomsFile = path.join(this.dataDir, 'rooms.jsonl');
    this.adminsFile = path.join(this.dataDir, 'admins.jsonl');
    this.uploadQuota = new Map();
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.messagesDir)) {
      fs.mkdirSync(this.messagesDir, { recursive: true });
    }
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
    if (!fs.existsSync(this.usersDir)) {
      fs.mkdirSync(this.usersDir, { recursive: true });
    }
    if (!fs.existsSync(this.roomsFile)) {
      fs.writeFileSync(this.roomsFile, '');
    }
    if (!fs.existsSync(this.adminsFile)) {
      fs.writeFileSync(this.adminsFile, '');
    }
  }

  getRoomMessageFile(roomId) {
    const today = new Date().toISOString().split('T')[0];
    const roomDir = path.join(this.messagesDir, roomId);
    if (!fs.existsSync(roomDir)) {
      fs.mkdirSync(roomDir, { recursive: true });
    }
    return path.join(roomDir, `${today}.jsonl`);
  }

  getTodayFileName() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.messagesDir, `${today}.jsonl`);
  }

  saveMessage(message, roomId) {
    const fileName = this.getRoomMessageFile(roomId);
    const line = JSON.stringify(message) + '\n';
    fs.appendFileSync(fileName, line);
  }

  loadRecentMessages(count = 50, roomId, beforeTimestamp = null) {
    const fileName = this.getRoomMessageFile(roomId);
    if (!fs.existsSync(fileName)) {
      return [];
    }

    const content = fs.readFileSync(fileName, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    let messages = lines.map(line => JSON.parse(line));

    if (beforeTimestamp) {
      messages = messages.filter(m => m.timestamp < beforeTimestamp);
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);
    return messages.slice(-count);
  }

  getMessagesSince(timestamp, roomId) {
    const fileName = this.getRoomMessageFile(roomId);
    if (!fs.existsSync(fileName)) {
      return [];
    }

    const content = fs.readFileSync(fileName, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    const messages = lines.map(line => JSON.parse(line));

    return messages.filter(m => m.timestamp > timestamp);
  }

  checkUploadQuota(ip, fileSize) {
    const today = new Date().toISOString().split('T')[0];
    const key = `${ip}-${today}`;
    const used = this.uploadQuota.get(key) || 0;
    const maxDaily = 100 * 1024 * 1024;

    if (used + fileSize > maxDaily) {
      return false;
    }

    this.uploadQuota.set(key, used + fileSize);
    return true;
  }

  saveUser(userInfo, roomId) {
    const userFile = path.join(this.usersDir, `${roomId}.jsonl`);
    const line = JSON.stringify(userInfo) + '\n';
    fs.appendFileSync(userFile, line);
  }

  loadUsers(roomId) {
    const userFile = path.join(this.usersDir, `${roomId}.jsonl`);
    if (!fs.existsSync(userFile)) {
      return [];
    }

    const content = fs.readFileSync(userFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    return lines.map(line => JSON.parse(line));
  }

  getUserByIP(ip, roomId) {
    const users = this.loadUsers(roomId);
    return users.find(user => user.ip === ip);
  }

  saveRoom(room) {
    const line = JSON.stringify(room) + '\n';
    fs.appendFileSync(this.roomsFile, line);
  }

  loadRooms() {
    if (!fs.existsSync(this.roomsFile)) {
      return [];
    }

    const content = fs.readFileSync(this.roomsFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    return lines.map(line => JSON.parse(line));
  }

  getRoomByInviteCode(code) {
    const rooms = this.loadRooms();
    return rooms.find(room => room.inviteCode === code && room.isActive);
  }

  updateRoomStatus(roomId, isActive) {
    const rooms = this.loadRooms();
    const updatedRooms = rooms.map(room =>
      room.roomId === roomId ? { ...room, isActive } : room
    );
    fs.writeFileSync(this.roomsFile, updatedRooms.map(r => JSON.stringify(r)).join('\n') + '\n');
  }

  deleteRoom(roomId) {
    const rooms = this.loadRooms();
    const filteredRooms = rooms.filter(room => room.roomId !== roomId);
    fs.writeFileSync(this.roomsFile, filteredRooms.map(r => JSON.stringify(r)).join('\n') + '\n');
  }

  saveAdmin(admin) {
    const line = JSON.stringify(admin) + '\n';
    fs.appendFileSync(this.adminsFile, line);
  }

  loadAdmins() {
    if (!fs.existsSync(this.adminsFile)) {
      return [];
    }

    const content = fs.readFileSync(this.adminsFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    return lines.map(line => JSON.parse(line));
  }

  getAdminByUsername(username) {
    const admins = this.loadAdmins();
    return admins.find(admin => admin.username === username);
  }

  updateAdminLastLogin(username) {
    const admins = this.loadAdmins();
    const updatedAdmins = admins.map(admin => {
      if (admin.username === username) {
        return { ...admin, lastLogin: Date.now() };
      }
      return admin;
    });

    fs.writeFileSync(this.adminsFile, updatedAdmins.map(a => JSON.stringify(a)).join('\n') + '\n');
  }

  updateAdminPassword(username, passwordHash) {
    const admins = this.loadAdmins();
    const updatedAdmins = admins.map(admin => {
      if (admin.username === username) {
        return { ...admin, passwordHash };
      }
      return admin;
    });

    fs.writeFileSync(this.adminsFile, updatedAdmins.map(a => JSON.stringify(a)).join('\n') + '\n');
  }

  deleteAdmin(username) {
    const admins = this.loadAdmins();
    const filteredAdmins = admins.filter(admin => admin.username !== username);
    fs.writeFileSync(this.adminsFile, filteredAdmins.map(a => JSON.stringify(a)).join('\n') + '\n');
  }
}

module.exports = new Storage();
