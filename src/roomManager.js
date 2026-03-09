const storage = require('./storage');
const Room = require('./room');
const logger = require('./logger');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.loadRooms();
  }

  loadRooms() {
    const rooms = storage.loadRooms();
    rooms.forEach(roomData => {
      if (roomData.isActive) {
        const room = new Room(roomData.roomId, roomData.name, roomData.maxUsers);
        this.rooms.set(roomData.roomId, room);
      }
    });
    logger.info(`Loaded ${this.rooms.size} active rooms`);
  }

  generateInviteCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do {
      code = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(name, maxUsers = 20, createdBy = 'admin') {
    const roomId = this.generateInviteCode();
    const roomData = {
      roomId,
      name,
      inviteCode: roomId,
      maxUsers,
      createdAt: Date.now(),
      createdBy,
      isActive: true
    };

    storage.saveRoom(roomData);
    const room = new Room(roomId, name, maxUsers);
    this.rooms.set(roomId, room);

    logger.info(`Room created: ${roomId} - ${name} by ${createdBy}`);
    return roomData;
  }

  getRoomByInviteCode(code) {
    return this.rooms.get(code.toUpperCase());
  }

  getAllRooms() {
    return storage.loadRooms();
  }

  getRoomStats() {
    const stats = [];
    this.rooms.forEach((room, roomId) => {
      stats.push({
        roomId,
        name: room.name,
        onlineCount: room.getOnlineCount(),
        maxUsers: room.maxUsers
      });
    });
    return stats;
  }

  updateRoomStatus(roomId, isActive) {
    storage.updateRoomStatus(roomId, isActive);
    if (!isActive) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.clients.forEach(ws => {
          ws.send(JSON.stringify({ type: 'kicked', message: '聊天室已被管理员关闭' }));
          ws.close();
        });
        this.rooms.delete(roomId);
      }
    } else {
      const roomData = storage.loadRooms().find(r => r.roomId === roomId);
      if (roomData) {
        const room = new Room(roomData.roomId, roomData.name, roomData.maxUsers);
        this.rooms.set(roomData.roomId, room);
      }
    }
    logger.info(`Room ${roomId} status updated: ${isActive}`);
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.clients.forEach(ws => {
        ws.send(JSON.stringify({ type: 'kicked', message: '聊天室已被管理员删除' }));
        ws.close();
      });
      this.rooms.delete(roomId);
    }
    storage.deleteRoom(roomId);
    logger.info(`Room deleted: ${roomId}`);
  }
}

module.exports = RoomManager;
