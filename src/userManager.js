const storage = require('./storage');

class UserManager {
  constructor() {
    this.onlineUsers = new Map();
    this.maxUsers = 20;
  }

  generateAvatar(seed) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  }

  generateNickname() {
    const adjectives = ['快乐的', '勇敢的', '聪明的', '友善的', '活泼的', '温柔的', '开朗的', '热情的'];
    const nouns = ['小猫', '小狗', '小鸟', '小熊', '小兔', '小鱼', '小鹿', '小狐狸'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}`;
  }

  isNicknameAvailable(nickname) {
    for (const user of this.onlineUsers.values()) {
      if (user.nickname === nickname) {
        return false;
      }
    }
    return true;
  }

  resolveNickname(nickname) {
    if (this.isNicknameAvailable(nickname)) {
      return nickname;
    }

    let counter = 2;
    while (!this.isNicknameAvailable(`${nickname}${counter}`)) {
      counter++;
    }
    return `${nickname}${counter}`;
  }

  canAddUser() {
    return this.onlineUsers.size < this.maxUsers;
  }

  addUser(ip, nickname = null) {
    if (!this.canAddUser()) {
      return null;
    }

    const existingUser = storage.getUserByIP(ip);
    let finalNickname = nickname;

    if (!finalNickname) {
      if (existingUser && existingUser.nickname) {
        finalNickname = existingUser.nickname;
      } else {
        finalNickname = this.generateNickname();
      }
    }

    finalNickname = this.resolveNickname(finalNickname);

    const user = {
      ip,
      nickname: finalNickname,
      avatar: this.generateAvatar(ip),
      joinTime: Date.now(),
      lastActivity: Date.now()
    };

    this.onlineUsers.set(ip, user);

    if (!existingUser) {
      storage.saveUser({ ip, nickname: finalNickname, firstSeen: Date.now() });
    }

    return user;
  }

  removeUser(ip) {
    this.onlineUsers.delete(ip);
  }

  getUser(ip) {
    return this.onlineUsers.get(ip);
  }

  updateActivity(ip) {
    const user = this.onlineUsers.get(ip);
    if (user) {
      user.lastActivity = Date.now();
    }
  }

  getOnlineCount() {
    return this.onlineUsers.size;
  }

  getAllUsers() {
    return Array.from(this.onlineUsers.values());
  }
}

module.exports = new UserManager();
