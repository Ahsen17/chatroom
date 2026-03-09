# 实时聊天室

一个基于 Node.js 和 WebSocket 的现代化实时聊天室应用，支持多房间、图片分享、管理后台等功能。

## 项目背景

这是一个功能完整的 Web 聊天室系统，旨在提供简洁、安全、高效的实时通讯体验。项目采用轻量级架构，无需数据库即可运行，所有数据通过 JSONL 格式持久化存储。

## 核心特性

- **多房间支持** - 通过 6 位邀请码创建和加入独立聊天室
- **实时通讯** - 基于 WebSocket 的即时消息推送
- **自动昵称** - 智能生成中文昵称（形容词 + 动物）
- **图片分享** - 支持图片上传和分享（5MB 限制）
- **安全防护** - IP 限流、XSS 防护、自动封禁机制
- **管理后台** - 完整的房间管理和账户管理系统
- **消息持久化** - JSONL 格式存储，支持历史消息查询
- **日志审计** - Winston 日志系统，每日轮转

## 技术实现

### 后端架构

- **Node.js** - 服务端运行环境
- **ws** - WebSocket 服务器
- **Express** - HTTP 服务器和 API 路由
- **Multer** - 文件上传处理
- **bcrypt** - 密码加密
- **Winston** - 日志管理
- **he** - HTML 编码防 XSS

### 前端技术

- **原生 JavaScript** - 无框架依赖
- **Bootstrap 5.3** - UI 组件库
- **WebSocket API** - 实时通讯
- **Fetch API** - HTTP 轮询

### 数据存储

采用文件系统存储，无需数据库：

- `/data/messages/` - 按日期组织的消息记录
- `/data/images/` - 上传的图片文件
- `/data/users.jsonl` - 用户注册信息
- `/data/rooms.jsonl` - 房间配置
- `/data/admins.jsonl` - 管理员账户
- `/logs/` - 应用日志

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务（默认端口 3000）
npm start

# 开发模式
npm run dev

# 自定义端口
PORT=8080 npm start
```

访问 `http://localhost:3000` 进入聊天室，访问 `http://localhost:3000/admin` 进入管理后台。

默认管理员账户：
- 用户名：`admin`
- 密码：`admin123`

## 安全特性

- IP 限流：每 3 分钟最多 20 条消息
- 轮询限流：每 5 秒最多 3 次请求
- 上传配额：每 IP 每天 100MB
- XSS 防护：所有用户输入 HTML 编码
- 会话管理：24 小时过期
- 登录保护：5 次失败锁定 15 分钟

## 项目结构

```
chatroom/
├── server.js              # HTTP 服务器入口
├── src/
│   ├── websocket.js       # WebSocket 服务器
│   ├── roomManager.js     # 多房间管理
│   ├── room.js            # 单个房间实例
│   ├── userManager.js     # 用户会话管理
│   ├── messageHandler.js  # 消息处理
│   ├── adminAuth.js       # 管理员认证
│   ├── security.js        # 安全防护
│   ├── storage.js         # 数据持久化
│   ├── encryption.js      # 加密工具
│   └── logger.js          # 日志系统
├── public/
│   ├── index.html         # 聊天室界面
│   ├── admin.html         # 管理后台
│   ├── js/
│   │   ├── client.js      # 聊天室客户端
│   │   └── admin.js       # 管理后台客户端
│   └── css/
│       └── style.css      # 样式文件
└── data/                  # 数据存储目录
```

## 特别鸣谢

本项目在开发过程中使用了 **Claude Code**，这是一个强大的 AI 编程助手，极大地提升了开发效率和代码质量。

Claude Code 在以下方面提供了重要帮助：

- 🏗️ **架构设计** - 提供了清晰的模块化架构建议
- 🔒 **安全实现** - 协助实现完善的安全防护机制
- 📝 **代码编写** - 生成高质量、可维护的代码
- 🐛 **问题排查** - 快速定位和解决技术难题
- 📚 **文档完善** - 帮助编写详细的技术文档

感谢 Anthropic 开发的 Claude，让 AI 辅助编程成为现实！

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提交 Issue。
