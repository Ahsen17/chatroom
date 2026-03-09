# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time web-based chatroom application built with Node.js and WebSockets. The application supports up to 20 concurrent users with automatic Chinese nickname generation, message persistence, and security features including rate limiting and XSS protection.

## Development Commands

```bash
# Install dependencies
npm install

# Start the server (default port 3000)
npm start

# Start with custom port
PORT=8080 npm start
```

## Architecture

### Backend Structure

The backend follows a modular architecture with clear separation of concerns:

- **server.js** - HTTP server entry point serving static files from `/public`
- **src/websocket.js** - WebSocket server managing connections, broadcasting, and heartbeat mechanism (30s intervals)
- **src/userManager.js** - User session management with 20-user limit, auto-generated Chinese nicknames (adjective + animal), and avatar generation via DiceBear API
- **src/messageHandler.js** - Message validation, sanitization, and history management (last 50 messages)
- **src/security.js** - Rate limiting (5 msg/sec per IP), IP blacklisting (5-min bans), and XSS protection
- **src/storage.js** - JSONL-based persistence for messages and users

### Data Flow

1. Client connects → WebSocket server assigns user via userManager
2. Messages flow through messageHandler → security validation → broadcast to all clients
3. All messages persisted to daily JSONL files in `/data/messages/YYYY-MM-DD.jsonl`
4. User registry maintained in `/data/users.jsonl`

### Frontend Architecture

- **public/index.html** - Bootstrap 5.3.0 UI with welcome modal and message display
- **public/js/client.js** - ChatClient class handling WebSocket connection with auto-reconnect (5 attempts), message rendering, and error handling
- **public/css/style.css** - Gradient backgrounds and fade-in animations for messages

## Key Configuration Values

- Max concurrent users: 20 (userManager.js)
- Rate limit: 5 messages/second per IP (security.js)
- Ban duration: 300 seconds (security.js)
- Message history: Last 50 messages (messageHandler.js)
- Heartbeat interval: 30 seconds (websocket.js)
- Text message max length: 1000 characters (security.js)
- Image URL max length: 500 characters (security.js)

## Security Considerations

- All user messages are HTML-encoded using the `he` library to prevent XSS
- IP-based rate limiting prevents spam
- Automatic IP blacklisting for rate limit violations
- Image URLs are validated before acceptance
- Message length validation enforced server-side

## Data Persistence

The application uses JSONL (JSON Lines) format for append-only logging:
- Messages: `/data/messages/YYYY-MM-DD.jsonl` (organized by date)
- Users: `/data/users.jsonl` (IP addresses and join timestamps)

When modifying storage logic, ensure JSONL format integrity (one JSON object per line).
