const he = require('he');

class Security {
  constructor() {
    this.rateLimits = new Map();
    this.blacklist = new Map();
    this.config = {
      maxMessagesPerSecond: 5,
      banDuration: 300000,
      windowSize: 1000
    };
  }

  escapeHtml(text) {
    return he.encode(text);
  }

  validateUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  checkRateLimit(ip) {
    if (this.isBlacklisted(ip)) {
      return false;
    }

    const now = Date.now();
    if (!this.rateLimits.has(ip)) {
      this.rateLimits.set(ip, []);
    }

    const timestamps = this.rateLimits.get(ip);
    const recentTimestamps = timestamps.filter(t => now - t < this.config.windowSize);

    if (recentTimestamps.length >= this.config.maxMessagesPerSecond) {
      this.addToBlacklist(ip);
      return false;
    }

    recentTimestamps.push(now);
    this.rateLimits.set(ip, recentTimestamps);
    return true;
  }

  addToBlacklist(ip) {
    const until = Date.now() + this.config.banDuration;
    this.blacklist.set(ip, until);
    console.log(`IP ${ip} 已被封禁至 ${new Date(until).toISOString()}`);
  }

  isBlacklisted(ip) {
    if (!this.blacklist.has(ip)) {
      return false;
    }

    const until = this.blacklist.get(ip);
    if (Date.now() > until) {
      this.blacklist.delete(ip);
      return false;
    }

    return true;
  }

  validateMessage(type, content) {
    if (type === 'text') {
      if (typeof content !== 'string' || content.length === 0 || content.length > 1000) {
        return false;
      }
      return true;
    }

    if (type === 'image') {
      if (typeof content !== 'string' || content.length > 500) {
        return false;
      }
      return this.validateUrl(content);
    }

    return false;
  }
}

module.exports = new Security();
