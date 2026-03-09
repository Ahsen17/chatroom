const http = require('http');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const websocketServer = require('./src/websocket');
const storage = require('./src/storage');
const logger = require('./src/logger');
const security = require('./src/security');
const RoomManager = require('./src/roomManager');
const AdminAuth = require('./src/adminAuth');

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();
const adminAuth = new AdminAuth();

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().split('T')[0];
    const dateDir = path.join(__dirname, 'data', 'images', today);

    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }

    cb(null, dateDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

function handleAdminRoutes(req, res) {
  if (req.url === '/admin' || req.url === '/admin/') {
    const filePath = path.join(__dirname, 'public', 'admin.html');
    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      }
    });
    return true;
  }

  if (req.method === 'POST' && req.url === '/admin/login') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { username, password } = JSON.parse(body);
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
        const sessionId = await adminAuth.authenticate(username, password, ip);
        if (sessionId) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '用户名或密码错误' }));
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '服务器错误' }));
      }
    });
    return true;
  }

  const sessionId = req.headers['x-session-id'];
  if (!adminAuth.validateSession(sessionId)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '未授权' }));
    return true;
  }

  if (req.method === 'POST' && req.url === '/admin/rooms') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, maxUsers } = JSON.parse(body);
        const room = roomManager.createRoom(name, maxUsers || 20);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(room));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '创建失败' }));
      }
    });
    return true;
  }

  if (req.method === 'GET' && req.url === '/admin/rooms') {
    const rooms = roomManager.getAllRooms();
    const stats = roomManager.getRoomStats();
    const result = rooms.map(room => {
      const stat = stats.find(s => s.roomId === room.roomId);
      return { ...room, onlineCount: stat?.onlineCount || 0 };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return true;
  }

  if (req.method === 'PUT' && req.url.startsWith('/admin/rooms/')) {
    const roomId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { isActive } = JSON.parse(body);
        roomManager.updateRoomStatus(roomId, isActive);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '更新失败' }));
      }
    });
    return true;
  }

  if (req.method === 'DELETE' && req.url.startsWith('/admin/rooms/')) {
    const roomId = req.url.split('/')[3];
    try {
      roomManager.deleteRoom(roomId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '删除失败' }));
    }
    return true;
  }

  if (req.method === 'GET' && req.url.startsWith('/admin/logs')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const logFile = path.join(__dirname, 'logs', `chatroom-${date}.log`);

    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '日志文件不存在' }));
    }
    return true;
  }

  if (req.method === 'GET' && req.url.startsWith('/admin/messages')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('roomId');
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!roomId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '缺少roomId参数' }));
      return true;
    }

    const messageFile = path.join(__dirname, 'data', 'messages', roomId, `${date}.jsonl`);
    if (fs.existsSync(messageFile)) {
      const content = fs.readFileSync(messageFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      const messages = lines.map(line => JSON.parse(line));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(messages));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https: http:;");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (process.env.ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
  }

  if (req.url.startsWith('/admin')) {
    if (handleAdminRoutes(req, res)) return;
  }

  if (req.method === 'POST' && req.url === '/upload') {
    upload.single('image')(req, res, (err) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!req.file) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '未上传文件' }));
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (!storage.checkUploadQuota(ip, req.file.size)) {
        fs.unlinkSync(req.file.path);
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '超出每日上传配额(100MB)' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: `/images/${today}/${req.file.filename}` }));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/messages')) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    if (!security.checkPollRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请求过于频繁，已被封禁' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const since = parseInt(url.searchParams.get('since')) || 0;
    const roomId = url.searchParams.get('roomId');

    if (!roomId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '缺少roomId参数' }));
      return;
    }

    const room = roomManager.getRoomByInviteCode(roomId);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '聊天室不存在' }));
      return;
    }

    const messages = room.messageHandler.getMessagesSince(since);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages }));
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/images/')) {
    // 支持 /images/YYYY-MM-DD/filename.jpg 格式
    const urlPath = req.url.substring('/images/'.length);
    const filePath = path.join(__dirname, 'data', 'images', urlPath);

    // 安全检查：确保路径在 images 目录内
    const imagesDir = path.join(__dirname, 'data', 'images');
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(imagesDir)) {
      res.writeHead(403);
      res.end('403 Forbidden');
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
    return;
  }

  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('500 Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

adminAuth.initDefaultAdmin().then(() => {
  websocketServer.initialize(server, roomManager);

  server.listen(PORT, () => {
    logger.info(`聊天室服务器运行在 http://localhost:${PORT}`);
  });
});
