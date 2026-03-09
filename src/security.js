const he = require('he');
const logger = require('./logger');

class Security {
  constructor() {
    this.rateLimits = new Map();
    this.blacklist = new Map();
    this.violations = new Map();
    this.connectionAttempts = new Map();
    this.pollRateLimits = new Map();
    this.config = {
      maxMessagesPerWindow: 20,
      windowSize: 180000,
      banDuration: 1800000,
      maxViolations: 5,
      maxConnectionsPerMinute: 5,
      maxPollsPerWindow: 3,
      pollWindowSize: 5000,
      pollBanDuration: 600000
    };
  }

  validateNickname(nickname) {
    if (typeof nickname !== 'string') return false;
    if (nickname.length < 1 || nickname.length > 20) return false;
    return /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(nickname);
  }

  checkConnectionLimit(ip) {
    const now = Date.now();
    if (!this.connectionAttempts.has(ip)) {
      this.connectionAttempts.set(ip, []);
    }

    const attempts = this.connectionAttempts.get(ip);
    const recentAttempts = attempts.filter(t => now - t < 60000);

    if (recentAttempts.length >= this.config.maxConnectionsPerMinute) {
      return false;
    }

    recentAttempts.push(now);
    this.connectionAttempts.set(ip, recentAttempts);
    return true;
  }

  escapeHtml(text) {
    return he.encode(text);
  }

  validateUrl(url) {
    try {
      const parsed = new URL(url);
      // 允许http、https和相对路径（以/开头）
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' || url.startsWith('/');
    } catch {
      // 如果URL解析失败，检查是否为相对路径
      return url.startsWith('/');
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

    if (recentTimestamps.length >= this.config.maxMessagesPerWindow) {
      const violationCount = (this.violations.get(ip) || 0) + 1;
      this.violations.set(ip, violationCount);

      if (violationCount >= this.config.maxViolations) {
        this.addToBlacklist(ip);
      }
      return false;
    }

    recentTimestamps.push(now);
    this.rateLimits.set(ip, recentTimestamps);
    this.violations.set(ip, 0);
    return true;
  }

  addToBlacklist(ip) {
    const until = Date.now() + this.config.banDuration;
    this.blacklist.set(ip, until);
    logger.warn(`IP ${ip} 已被封禁至 ${new Date(until).toISOString()}`);
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

  checkPollRateLimit(ip) {
    if (this.isBlacklisted(ip)) {
      return false;
    }

    const now = Date.now();
    if (!this.pollRateLimits.has(ip)) {
      this.pollRateLimits.set(ip, []);
    }

    const timestamps = this.pollRateLimits.get(ip);
    const recentTimestamps = timestamps.filter(t => now - t < this.config.pollWindowSize);

    if (recentTimestamps.length >= this.config.maxPollsPerWindow) {
      const until = Date.now() + this.config.pollBanDuration;
      this.blacklist.set(ip, until);
      logger.warn(`IP ${ip} 因轮询过于频繁被封禁至 ${new Date(until).toISOString()}`);
      return false;
    }

    recentTimestamps.push(now);
    this.pollRateLimits.set(ip, recentTimestamps);
    return true;
  }
}

module.exports = new Security();
