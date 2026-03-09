class ChatClient {
  constructor() {
    this.ws = null;
    this.currentUser = null;
    this.sessionKey = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.shouldReconnect = true;
    this.messageArea = document.getElementById('messageArea');
    this.messagesContainer = document.getElementById('messagesContainer');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.imageBtn = document.getElementById('imageBtn');
    this.loadMoreBtn = document.getElementById('loadMoreBtn');
    this.onlineCount = document.getElementById('onlineCount');
    this.oldestTimestamp = null;
    this.lastMessageTimestamp = 0;
    this.pollInterval = null;
    this.isSending = false;
    this.pendingMessageId = null;

    this.initializeUI();
  }

  initializeUI() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    this.imageBtn.addEventListener('click', () => {
      const imageModal = new bootstrap.Modal(document.getElementById('imageModal'));
      imageModal.show();
    });

    document.getElementById('sendImageBtn').addEventListener('click', () => {
      const url = document.getElementById('imageUrlInput').value.trim();
      if (url) {
        this.sendImageMessage(url);
        document.getElementById('imageUrlInput').value = '';
        bootstrap.Modal.getInstance(document.getElementById('imageModal')).hide();
      }
    });

    this.loadMoreBtn.addEventListener('click', () => this.loadMoreMessages());

    this.messageArea.addEventListener('scroll', () => {
      if (this.messageArea.scrollTop === 0 && this.oldestTimestamp) {
        this.loadMoreMessages();
      }
    });

    document.addEventListener('paste', (e) => this.handlePaste(e));

    this.connect();
  }

  connect(nickname = null) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket连接已建立');
      this.reconnectAttempts = 0;

      if (!nickname) {
        this.ws.send(JSON.stringify({ type: 'check_history' }));
      } else {
        this.ws.send(JSON.stringify({ type: 'join', nickname }));
      }
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket连接已关闭');
      if (this.shouldReconnect) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      this.showError('连接错误，请刷新页面重试');
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.showSystemMessage(`连接断开，正在重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(this.currentUser?.nickname), 2000);
    } else {
      this.showError('无法连接到服务器，请刷新页面');
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'history_check':
        if (data.hasHistory && data.user) {
          // 直接使用当前连接发送 join 消息，不需要重新连接
          this.ws.send(JSON.stringify({ type: 'join', nickname: data.user.nickname }));
        } else {
          const welcomeModal = new bootstrap.Modal(document.getElementById('welcomeModal'));
          welcomeModal.show();
          document.getElementById('joinBtn').addEventListener('click', () => {
            const nickname = document.getElementById('nicknameInput').value.trim();
            this.ws.send(JSON.stringify({ type: 'join', nickname }));
            welcomeModal.hide();
          });
        }
        break;

      case 'welcome':
        this.currentUser = data.user;
        this.sessionKey = data.sessionKey;
        this.updateOnlineCount(data.onlineCount);
        data.history.forEach(msg => this.renderMessage(msg, false));
        if (data.history.length > 0) {
          this.oldestTimestamp = data.history[0].timestamp;
          this.lastMessageTimestamp = data.history[data.history.length - 1].timestamp;
          this.loadMoreBtn.style.display = 'block';
        }
        this.scrollToBottom();
        this.startPolling();
        break;

      case 'text':
      case 'image':
        // 直接使用消息，不解密
        this.renderMessage(data);
        this.lastMessageTimestamp = Math.max(this.lastMessageTimestamp, data.timestamp);

        // 如果是自己发送的消息，解除输入禁用
        if (this.currentUser && data.sender.nickname === this.currentUser.nickname) {
          this.setInputDisabled(false);
        }
        break;

      case 'history_loaded':
        if (data.messages.length > 0) {
          const scrollHeight = this.messageArea.scrollHeight;
          data.messages.forEach(msg => this.renderMessage(msg, false, true));
          this.oldestTimestamp = data.messages[0].timestamp;
          this.messageArea.scrollTop = this.messageArea.scrollHeight - scrollHeight;
        } else {
          this.loadMoreBtn.style.display = 'none';
        }
        break;

      case 'user_joined':
        this.showSystemMessage(`${data.user.nickname} 加入了聊天室`);
        this.updateOnlineCount(data.onlineCount);
        break;

      case 'user_left':
        this.showSystemMessage(`${data.user.nickname} 离开了聊天室`);
        this.updateOnlineCount(data.onlineCount);
        break;

      case 'kicked':
        this.shouldReconnect = false;
        this.showError(data.message);
        break;

      case 'error':
        this.showError(data.message);
        break;
    }
  }

  renderMessage(message, scroll = true, prepend = false) {
    const isOwn = this.currentUser && message.sender.nickname === this.currentUser.nickname;

    const messageCard = document.createElement('div');
    messageCard.className = `message-card ${isOwn ? 'own' : 'other'}`;

    const header = document.createElement('div');
    header.className = 'message-header';

    if (!isOwn) {
      const avatar = document.createElement('img');
      avatar.src = message.sender.avatar;
      avatar.className = 'avatar';
      avatar.alt = message.sender.nickname;
      header.appendChild(avatar);
    }

    const nickname = document.createElement('span');
    nickname.className = 'nickname';
    nickname.textContent = message.sender.nickname;
    header.appendChild(nickname);

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = this.formatTime(message.timestamp);
    header.appendChild(timestamp);

    const content = document.createElement('div');
    content.className = 'message-content';

    if (message.type === 'text') {
      const decodedText = he.decode(message.content);
      // 检测文本中的URL并转换为链接或图片
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const imagePattern = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?[^\s]*)?$/i;
      const parts = decodedText.split(urlPattern);

      parts.forEach((part, index) => {
        // 奇数索引是匹配到的URL（因为split会保留捕获组）
        if (index % 2 === 1) {
          // 检查是否为图片URL
          if (imagePattern.test(part)) {
            const img = document.createElement('img');
            img.src = part;
            img.className = 'message-image';
            img.alt = '图片';
            img.loading = 'lazy';
            img.style.maxWidth = '300px';
            img.onerror = () => {
              // 如果图片加载失败，显示为链接
              img.replaceWith(this.createLink(part));
            };
            content.appendChild(img);
          } else {
            // 普通链接
            content.appendChild(this.createLink(part));
          }
        } else if (part) {
          // 偶数索引是普通文本
          content.appendChild(document.createTextNode(part));
        }
      });
    } else if (message.type === 'image') {
      const img = document.createElement('img');
      img.src = message.content;
      img.className = 'message-image';
      img.alt = '图片';
      img.loading = 'lazy';
      img.onerror = () => {
        img.style.display = 'none';
        const errorText = document.createElement('div');
        errorText.textContent = '图片加载失败';
        errorText.style.color = '#dc3545';
        content.appendChild(errorText);
        const urlText = document.createElement('div');
        urlText.style.fontSize = '0.8rem';
        urlText.style.color = '#6c757d';
        urlText.style.wordBreak = 'break-all';
        urlText.textContent = message.content;
        content.appendChild(urlText);
      };
      content.appendChild(img);
    }

    messageCard.appendChild(header);
    messageCard.appendChild(content);

    if (prepend) {
      this.messagesContainer.insertBefore(messageCard, this.messagesContainer.firstChild);
    } else {
      this.messagesContainer.appendChild(messageCard);
    }

    if (scroll) {
      this.scrollToBottom();
    }
  }

  showSystemMessage(text) {
    const systemMsg = document.createElement('div');
    systemMsg.className = 'system-message';
    systemMsg.textContent = text;
    this.messagesContainer.appendChild(systemMsg);
    this.scrollToBottom();
  }

  createLink(url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    // 尝试提取文件名或显示简短URL
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();

      if (filename && filename.length > 0) {
        link.textContent = filename;
        link.title = url;
      } else {
        link.textContent = url;
      }
    } catch {
      link.textContent = url;
    }

    return link;
  }

  sendMessage() {
    const content = this.messageInput.value.trim();
    console.log('sendMessage called, content:', content, 'isSending:', this.isSending);

    if (!content || this.isSending) return;

    // 检测是否为URL
    const urlPattern = /^https?:\/\/.+/i;
    if (urlPattern.test(content)) {
      // 检测是否为图片URL
      const imagePattern = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
      if (imagePattern.test(content)) {
        this.sendImageMessage(content);
        this.messageInput.value = '';
        return;
      }
    }

    console.log('准备发送文本消息:', content);
    this.setInputDisabled(true);
    this.pendingMessageId = Date.now();

    // 暂时禁用加密，直接发送明文
    const message = {
      type: 'text',
      content: content
    };
    console.log('发送消息:', message);
    this.ws.send(JSON.stringify(message));
    this.messageInput.value = '';
  }

  sendImageMessage(url) {
    if (this.isSending) return;

    this.setInputDisabled(true);
    this.pendingMessageId = Date.now();

    this.ws.send(JSON.stringify({ type: 'image', content: url }));
  }

  loadMoreMessages() {
    if (this.oldestTimestamp) {
      this.ws.send(JSON.stringify({
        type: 'load_more',
        beforeTimestamp: this.oldestTimestamp
      }));
    }
  }

  async handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        await this.uploadImage(file);
        return;
      }
    }
  }

  async uploadImage(file) {
    if (file.size > 5 * 1024 * 1024) {
      this.showError('图片大小不能超过5MB');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        this.sendImageMessage(result.path);
      } else {
        this.showError(result.error || '上传失败');
      }
    } catch (error) {
      this.showError('上传失败: ' + error.message);
    }
  }

  encrypt(text) {
    const key = CryptoJS.enc.Base64.parse(this.sessionKey);
    const iv = CryptoJS.lib.WordArray.random(12);
    const encrypted = CryptoJS.AES.encrypt(text, key, {
      iv: iv,
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.NoPadding
    });
    return iv.toString(CryptoJS.enc.Base64) + ':' + encrypted.toString();
  }

  decrypt(ciphertext) {
    const parts = ciphertext.split(':');
    const iv = CryptoJS.enc.Base64.parse(parts[0]);
    const encrypted = parts[1];
    const key = CryptoJS.enc.Base64.parse(this.sessionKey);
    const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
      iv: iv,
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.NoPadding
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  updateOnlineCount(count) {
    this.onlineCount.textContent = `在线：${count}/20`;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  scrollToBottom() {
    this.messageArea.scrollTop = this.messageArea.scrollHeight;
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast alert alert-danger alert-dismissible fade show';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
  }

  startPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(() => {
      this.fetchNewMessages();
    }, 5000);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async fetchNewMessages() {
    try {
      const response = await fetch(`/api/messages?since=${this.lastMessageTimestamp}`);
      if (!response.ok) {
        if (response.status === 429) {
          this.showError('请求过于频繁，已被暂时限制');
          this.stopPolling();
        }
        return;
      }

      const data = await response.json();
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(msg => {
          this.renderMessage(msg);
          this.lastMessageTimestamp = Math.max(this.lastMessageTimestamp, msg.timestamp);

          // 如果是自己发送的消息，解除输入禁用
          if (this.currentUser && msg.sender.nickname === this.currentUser.nickname) {
            this.setInputDisabled(false);
          }
        });
      }
    } catch (error) {
      console.error('获取新消息失败:', error);
    }
  }

  setInputDisabled(disabled) {
    this.isSending = disabled;
    this.messageInput.disabled = disabled;
    this.sendBtn.disabled = disabled;
    this.imageBtn.disabled = disabled;

    // 添加或移除加载图标
    const loadingContainer = document.getElementById('loadingIconContainer');
    if (disabled) {
      loadingContainer.innerHTML = `
        <span class="spinner-border spinner-border-sm text-primary" role="status" style="margin: 0 8px;">
          <span class="visually-hidden">发送中...</span>
        </span>
      `;
    } else {
      loadingContainer.innerHTML = '';
      this.pendingMessageId = null;
    }
  }
}

const chatClient = new ChatClient();
