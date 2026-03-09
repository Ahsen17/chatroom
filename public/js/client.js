class ChatClient {
  constructor() {
    this.ws = null;
    this.currentUser = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.messageArea = document.getElementById('messageArea');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.imageBtn = document.getElementById('imageBtn');
    this.onlineCount = document.getElementById('onlineCount');

    this.initializeUI();
  }

  initializeUI() {
    const welcomeModal = new bootstrap.Modal(document.getElementById('welcomeModal'));
    welcomeModal.show();

    document.getElementById('joinBtn').addEventListener('click', () => {
      const nickname = document.getElementById('nicknameInput').value.trim();
      this.connect(nickname);
      welcomeModal.hide();
    });

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
  }

  connect(nickname) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket连接已建立');
      this.reconnectAttempts = 0;
      this.ws.send(JSON.stringify({ type: 'join', nickname }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket连接已关闭');
      this.attemptReconnect();
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
      case 'welcome':
        this.currentUser = data.user;
        this.updateOnlineCount(data.onlineCount);
        data.history.forEach(msg => this.renderMessage(msg, false));
        this.scrollToBottom();
        break;

      case 'text':
      case 'image':
        this.renderMessage(data);
        break;

      case 'user_joined':
        this.showSystemMessage(`${data.user.nickname} 加入了聊天室`);
        this.updateOnlineCount(data.onlineCount);
        break;

      case 'user_left':
        this.showSystemMessage(`${data.user.nickname} 离开了聊天室`);
        this.updateOnlineCount(data.onlineCount);
        break;

      case 'error':
        this.showError(data.message);
        break;
    }
  }

  renderMessage(message, scroll = true) {
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
      content.textContent = message.content;
    } else if (message.type === 'image') {
      const img = document.createElement('img');
      img.src = message.content;
      img.className = 'message-image';
      img.alt = '图片';
      img.loading = 'lazy';
      img.onerror = () => {
        img.style.display = 'none';
        content.textContent = '图片加载失败';
      };
      content.appendChild(img);
    }

    messageCard.appendChild(header);
    messageCard.appendChild(content);
    this.messageArea.appendChild(messageCard);

    if (scroll) {
      this.scrollToBottom();
    }

    this.limitMessages();
  }

  showSystemMessage(text) {
    const systemMsg = document.createElement('div');
    systemMsg.className = 'system-message';
    systemMsg.textContent = text;
    this.messageArea.appendChild(systemMsg);
    this.scrollToBottom();
  }

  sendMessage() {
    const content = this.messageInput.value.trim();
    if (!content) return;

    this.ws.send(JSON.stringify({ type: 'text', content }));
    this.messageInput.value = '';
  }

  sendImageMessage(url) {
    this.ws.send(JSON.stringify({ type: 'image', content: url }));
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

  limitMessages() {
    const messages = this.messageArea.querySelectorAll('.message-card');
    if (messages.length > 200) {
      messages[0].remove();
    }
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast alert alert-danger alert-dismissible fade show';
    toast.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
  }
}

const chatClient = new ChatClient();
