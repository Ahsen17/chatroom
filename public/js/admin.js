class AdminClient {
  constructor() {
    this.sessionId = localStorage.getItem('adminSession');
    if (this.sessionId) {
      this.showAdminPage();
      this.loadRooms();
    }
  }

  async login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const response = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (response.ok) {
        this.sessionId = data.sessionId;
        localStorage.setItem('adminSession', this.sessionId);
        this.showAdminPage();
        this.loadRooms();
      } else {
        alert(data.error || '登录失败');
      }
    } catch (error) {
      alert('登录失败：' + error.message);
    }
  }

  logout() {
    this.sessionId = null;
    localStorage.removeItem('adminSession');
    document.getElementById('loginPage').style.display = 'block';
    document.getElementById('adminPage').style.display = 'none';
  }

  showAdminPage() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'block';
  }

  async createRoom() {
    const name = document.getElementById('roomName').value.trim();
    const maxUsers = parseInt(document.getElementById('maxUsers').value) || 20;

    if (!name) {
      alert('请输入聊天室名称');
      return;
    }

    try {
      const response = await fetch('/admin/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({ name, maxUsers })
      });

      const data = await response.json();
      if (response.ok) {
        alert(`聊天室创建成功！邀请码：${data.inviteCode}`);
        document.getElementById('roomName').value = '';
        this.loadRooms();
      } else {
        alert(data.error || '创建失败');
      }
    } catch (error) {
      alert('创建失败：' + error.message);
    }
  }

  async loadRooms() {
    try {
      const response = await fetch('/admin/rooms', {
        headers: { 'X-Session-Id': this.sessionId }
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        return;
      }

      const rooms = await response.json();
      const tbody = document.getElementById('roomsList');
      tbody.innerHTML = rooms.map(room => `
        <tr>
          <td><strong>${room.inviteCode}</strong></td>
          <td>${room.name}</td>
          <td>${room.onlineCount || 0}/${room.maxUsers}</td>
          <td>${new Date(room.createdAt).toLocaleString('zh-CN')}</td>
          <td>${room.createdBy}</td>
          <td>
            <span class="badge ${room.isActive ? 'bg-success' : 'bg-secondary'}">${room.isActive ? '启用' : '关闭'}</span>
          </td>
          <td>
            <button class="btn btn-sm ${room.isActive ? 'btn-warning' : 'btn-success'}" onclick="adminClient.toggleRoom('${room.roomId}', ${!room.isActive})">
              ${room.isActive ? '关闭' : '启用'}
            </button>
            <button class="btn btn-sm btn-danger" onclick="adminClient.deleteRoom('${room.roomId}')">删除</button>
          </td>
        </tr>
      `).join('');

      const select = document.getElementById('chatRoomSelect');
      select.innerHTML = '<option value="">请选择聊天室</option>' + rooms.map(room =>
        `<option value="${room.roomId}">${room.name} (${room.inviteCode})</option>`
      ).join('');

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('logDate').value = today;
      document.getElementById('chatDate').value = today;
    } catch (error) {
      console.error('加载聊天室失败：', error);
    }
  }

  async loadSystemLogs() {
    const date = document.getElementById('logDate').value;
    if (!date) {
      alert('请选择日期');
      return;
    }

    try {
      const response = await fetch(`/admin/logs?date=${date}`, {
        headers: { 'X-Session-Id': this.sessionId }
      });

      if (response.ok) {
        const logs = await response.text();
        document.getElementById('systemLogs').textContent = logs || '暂无日志';
      } else {
        document.getElementById('systemLogs').textContent = '日志文件不存在';
      }
    } catch (error) {
      alert('加载日志失败：' + error.message);
    }
  }

  async loadChatHistory() {
    const roomId = document.getElementById('chatRoomSelect').value;
    const date = document.getElementById('chatDate').value;

    if (!roomId) {
      alert('请选择聊天室');
      return;
    }
    if (!date) {
      alert('请选择日期');
      return;
    }

    try {
      const response = await fetch(`/admin/messages?roomId=${roomId}&date=${date}`, {
        headers: { 'X-Session-Id': this.sessionId }
      });

      if (response.ok) {
        const messages = await response.json();
        const container = document.getElementById('chatHistory');
        if (messages.length === 0) {
          container.innerHTML = '<p class="text-muted">暂无聊天记录</p>';
        } else {
          container.innerHTML = messages.map(msg => `
            <div class="border-bottom pb-2 mb-2">
              <small class="text-muted">${new Date(msg.timestamp).toLocaleString('zh-CN')}</small>
              <strong>${msg.sender.nickname}:</strong>
              ${msg.type === 'text' ? msg.content : `<img src="${msg.content}" style="max-width: 200px;">`}
            </div>
          `).join('');
        }
      } else {
        alert('加载聊天记录失败');
      }
    } catch (error) {
      alert('加载聊天记录失败：' + error.message);
    }
  }

  async toggleRoom(roomId, isActive) {
    if (!confirm(`确定要${isActive ? '启用' : '关闭'}此聊天室吗？`)) return;

    try {
      const response = await fetch(`/admin/rooms/${roomId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({ isActive })
      });

      if (response.ok) {
        alert('操作成功');
        this.loadRooms();
      } else {
        alert('操作失败');
      }
    } catch (error) {
      alert('操作失败：' + error.message);
    }
  }

  async deleteRoom(roomId) {
    if (!confirm('确定要删除此聊天室吗？此操作不可恢复！')) return;

    try {
      const response = await fetch(`/admin/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.sessionId }
      });

      if (response.ok) {
        alert('删除成功');
        this.loadRooms();
      } else {
        alert('删除失败');
      }
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  }
}

const adminClient = new AdminClient();
