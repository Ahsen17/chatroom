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
```

## Architecture

### Backend Structure

The backend follows a modular architecture with clear separation of concerns:

- **server.js** - HTTP server entry point serving static files from `/public`, handling image uploads via multer (5MB limit), serving uploaded images from `/data/images`, and providing `/api/messages` endpoint for polling new messages
- **src/websocket.js** - WebSocket server managing connections, broadcasting, heartbeat mechanism (30s intervals), and enforcing one connection per IP (duplicate connections kick the old one)
- **src/userManager.js** - User session management with 20-user limit, auto-generated Chinese nicknames (adjective + animal), and avatar generation via DiceBear API
- **src/messageHandler.js** - Message validation, sanitization, history management (last 50 messages), and API for fetching messages since a timestamp
- **src/security.js** - Rate limiting (20 msg/3min per IP), IP blacklisting (30-min bans), XSS protection, and poll rate limiting (3 requests/5sec, 10-min ban if exceeded)
- **src/storage.js** - JSONL-based persistence for messages and users, upload quota tracking (100MB per IP per day), and message retrieval by timestamp
- **src/encryption.js** - AES-256-GCM encryption utilities for sensitive data (key generation, encrypt/decrypt methods)
- **src/logger.js** - Winston-based logging with daily rotation (10MB max size, 5 days retention) to `/logs/chatroom-YYYY-MM-DD.log`

### Data Flow

1. Client connects → WebSocket server assigns user via userManager
2. Messages flow through messageHandler → security validation → broadcast to all clients
3. Client polls `/api/messages?since=<timestamp>` every 5 seconds to fetch new messages (poll rate limited: max 3 requests per 5 seconds)
4. Image uploads: POST to `/upload` → multer validation → quota check → stored in `/data/images/YYYY-MM-DD/` with UUID filename
5. All messages persisted to daily JSONL files in `/data/messages/YYYY-MM-DD.jsonl`
6. User registry maintained in `/data/users.jsonl`
7. All operations logged via winston to `/logs/chatroom-YYYY-MM-DD.log`

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
- **public/css/style.css** - Gradient backgrounds and fade-in animations for messages

## Key Configuration Values

- Max concurrent users: 20 (userManager.js)
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
- Uploaded images: `/data/images/YYYY-MM-DD/` (organized by date with UUID-based filenames)
- Application logs: `/logs/chatroom-YYYY-MM-DD.log` (winston daily rotation)

When modifying storage logic, ensure JSONL format integrity (one JSON object per line).

## Language Preference

Default output language is Chinese unless otherwise specified by the user.
