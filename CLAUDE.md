# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time web-based chatroom application built with Node.js and WebSockets. The application supports up to 20 concurrent users with automatic Chinese nickname generation, message persistence, and security features including rate limiting and XSS protection.

## Development Commands

```bash
# Install dependencies
npm install

# Start in production mode (default port 3000)
npm start

# Start in development mode
npm run dev

# Start with custom port
PORT=8080 npm start

# Set allowed CORS origin (optional)
ALLOWED_ORIGIN=https://example.com npm start

# Build for production (compress, minify, obfuscate)
npm run build

# Clean build artifacts
npm run clean
```

## Build and Deployment

The project uses a custom build script (`build.js`) that compresses, minifies, and obfuscates code for production deployment:

**Build process:**
- Backend: Each module in `src/` is individually compressed and obfuscated using terser with aggressive settings (3-pass compression, toplevel mangling, property mangling for `_` prefixed names)
- Frontend: JS/CSS/HTML files are minified and obfuscated (removes console logs, comments, and applies aggressive compression)
- Output: All processed files are written to `dist/` directory with simplified `package.json` (devDependencies removed)

**Build tools:**
- `terser` - JavaScript compression and obfuscation
- `html-minifier-terser` - HTML minification
- `clean-css` - CSS optimization

**Deployment:**
1. Run `npm run build` to generate `dist/` directory
2. Deploy the `dist/` directory to production server
3. Run `npm install --production` in `dist/` to install runtime dependencies only
4. Start with `npm start`

## Architecture

### Backend Structure

The backend follows a modular architecture with clear separation of concerns:

- **server.js** - HTTP server entry point serving static files from `/public`, handling image uploads via multer (5MB limit), serving uploaded images from `/data/images`, providing `/api/messages` endpoint for polling new messages, and admin API routes (`/admin/*`)
- **src/websocket.js** - WebSocket server managing connections, broadcasting, heartbeat mechanism (30s intervals), and enforcing one connection per IP (duplicate connections kick the old one)
- **src/roomManager.js** - Multi-room management with 6-character invite codes, room creation/deletion, status toggling, and room statistics
- **src/room.js** - Individual room instance managing its own UserManager, MessageHandler, and WebSocket clients
- **src/userManager.js** - User session management with configurable user limit (default 20), auto-generated Chinese nicknames (adjective + animal), and avatar generation via DiceBear API
- **src/messageHandler.js** - Message validation, sanitization, history management (last 50 messages), and API for fetching messages since a timestamp
- **src/adminAuth.js** - Admin authentication with bcrypt password hashing, session management (24h expiry), login attempt tracking (5 attempts, 15-min lockout), and multi-admin account management (create, delete, password changes)
- **src/security.js** - Rate limiting (20 msg/3min per IP), IP blacklisting (30-min bans), XSS protection, and poll rate limiting (3 requests/5sec, 10-min ban if exceeded)
- **src/storage.js** - JSONL-based persistence for messages, users, rooms, and admin accounts; upload quota tracking (100MB per IP per day)
- **src/encryption.js** - AES-256-GCM encryption utilities for sensitive data (key generation, encrypt/decrypt methods)
- **src/logger.js** - Winston-based logging with daily rotation (10MB max size, 5 days retention) to `/logs/chatroom-YYYY-MM-DD.log`

### Data Flow

1. Client connects with room invite code → WebSocket server routes to specific room → room assigns user via its userManager
2. Messages flow through room's messageHandler → security validation → broadcast to all clients in that room
3. Client polls `/api/messages?since=<timestamp>` every 5 seconds to fetch new messages (poll rate limited: max 3 requests per 5 seconds)
4. Image uploads: POST to `/upload` → multer validation → quota check → stored in `/data/images/YYYY-MM-DD/` with UUID filename
5. All messages persisted to daily JSONL files in `/data/messages/YYYY-MM-DD.jsonl`
6. User registry maintained in `/data/users.jsonl`
7. Room registry maintained in `/data/rooms.jsonl`
8. Admin accounts stored in `/data/admins.jsonl` with bcrypt-hashed passwords
9. All operations logged via winston to `/logs/chatroom-YYYY-MM-DD.log`

### Room Management

- Each room has a unique 6-character invite code (e.g., "A3K7M2") generated from alphanumeric chars excluding ambiguous ones (0, 1, I, O)
- Rooms are isolated - users in different rooms cannot see each other's messages
- Each room maintains its own UserManager and MessageHandler instances
- Default admin credentials: username `admin`, password `admin123` (created on first startup)

### WebSocket Message Protocol

Client-to-Server messages:
- `{type: 'check_history'}` - Check if user has previous session
- `{type: 'join', nickname: string}` - Join chatroom with nickname
- `{type: 'text', content: string}` - Send text message (plaintext)
- `{type: 'image', content: string}` - Send image URL

Server-to-Client messages:
- `{type: 'history_check', hasHistory: boolean, user?: object}` - Response to history check
- `{type: 'welcome', user: object, onlineCount: number, history: array}` - Successful join
- `{type: 'user_joined', user: object, onlineCount: number}` - Another user joined
- `{type: 'user_left', nickname: string, onlineCount: number}` - User disconnected
- `{type: 'text'|'image', ...message}` - Broadcast message
- `{type: 'error', message: string}` - Error notification
- `{type: 'kicked', message: string}` - Duplicate connection detected

Connection handling:
- One connection per IP address (duplicate connections kick the old one)
- Client auto-reconnects up to 5 times with exponential backoff
- Heartbeat pings every 30 seconds to maintain connection

### Frontend Architecture

- **public/index.html** - Bootstrap 5.3.0 UI with welcome modal and message display
- **public/js/client.js** - ChatClient class handling WebSocket connection with auto-reconnect (5 attempts), message rendering, error handling, and HTTP polling every 5 seconds for new messages
- **public/admin.html** - Admin dashboard with room management, account management, and log audit tabs
- **public/js/admin.js** - AdminClient class handling authentication, room CRUD operations, admin account management, and log viewing
- **public/css/style.css** - Gradient backgrounds and fade-in animations for messages

## Key Configuration Values

- Max concurrent users per room: 20 (default, configurable per room in roomManager.js)
- Message rate limit: 20 messages per 3 minutes per IP (security.js)
- Poll rate limit: 3 requests per 5 seconds per IP (security.js)
- Message ban duration: 30 minutes (security.js)
- Poll ban duration: 10 minutes (security.js)
- Message history: Last 50 messages (messageHandler.js)
- Heartbeat interval: 30 seconds (websocket.js)
- Poll interval: 5 seconds (client.js)
- Text message max length: 1000 characters (security.js)
- Image URL max length: 500 characters (security.js)
- Image upload max size: 5MB per file (server.js)
- Daily upload quota: 100MB per IP (storage.js)
- Log rotation: 10MB max size, 5 days retention (logger.js)
- Admin session timeout: 24 hours (adminAuth.js)
- Admin login attempts: 5 max, 15-minute lockout (adminAuth.js)
- Admin password length: 6-100 characters (adminAuth.js)
- Admin username: alphanumeric, underscore, hyphen only, max 50 chars (adminAuth.js)
- Room invite code length: 6 characters (roomManager.js)

## Security Considerations

- All user messages are HTML-encoded using the `he` library to prevent XSS
- IP-based rate limiting prevents spam
- Automatic IP blacklisting for rate limit violations
- Image URLs are validated before acceptance
- Message length validation enforced server-side
- Security headers: X-Content-Type-Options, X-Frame-Options, Content-Security-Policy (allows scripts from cdn.jsdelivr.net and cdnjs.cloudflare.com)
- Image uploads restricted to image/* MIME types only
- Upload quota enforcement (100MB per IP per day)
- Messages are currently transmitted in plaintext (encryption.js module exists but is not actively used in message flow)

## Data Persistence

The application uses JSONL (JSON Lines) format for append-only logging:
- Messages: `/data/messages/YYYY-MM-DD.jsonl` (organized by date)
- Users: `/data/users.jsonl` (IP addresses and join timestamps)
- Rooms: `/data/rooms.jsonl` (room configurations and metadata)
- Admin accounts: `/data/admins.jsonl` (usernames and bcrypt-hashed passwords)
- Uploaded images: `/data/images/YYYY-MM-DD/` (organized by date with UUID-based filenames)
- Application logs: `/logs/chatroom-YYYY-MM-DD.log` (winston daily rotation)

When modifying storage logic, ensure JSONL format integrity (one JSON object per line).

## Admin Panel

Access the admin panel at `/admin` with default credentials (username: `admin`, password: `admin123`).

Admin capabilities:
- Create new rooms with custom names and user limits
- View all rooms with real-time online user counts
- Enable/disable rooms (kicks all users when disabled)
- Delete rooms permanently
- Create new admin accounts (admin-only)
- Change passwords (admin can change any, others can change own)
- Delete admin accounts (admin-only, cannot delete 'admin' account)
- View application logs with filtering

Admin permission model:
- The 'admin' account has full privileges (create/delete accounts, change any password)
- Regular admin accounts can only change their own password
- The 'admin' account cannot be deleted

Admin API endpoints (require `X-Session-Id` header):
- `POST /admin/login` - Authenticate and get session ID
- `POST /admin/logout` - Invalidate session
- `GET /admin/rooms` - List all rooms with stats
- `POST /admin/rooms` - Create new room
- `PUT /admin/rooms/:roomId/status` - Toggle room active status
- `DELETE /admin/rooms/:roomId` - Delete room
- `GET /admin/accounts` - List all admin accounts
- `POST /admin/accounts` - Create new admin account (admin-only)
- `PUT /admin/accounts/password` - Change admin password
- `DELETE /admin/accounts/:username` - Delete admin account (admin-only)
- `GET /admin/logs` - Fetch application logs

## Language Preference

Default output language is Chinese unless otherwise specified by the user.
