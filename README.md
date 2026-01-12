# NZR Dev Plugin

Control VSCode remotely from your mobile device. Browse files, execute terminal commands, chat with AI assistants, and receive notifications - all from your phone.

## Architecture

```
                     +------------------+
                     |   Relay Server   |
                     |  (Cloud/Docker)  |
                     +--------+---------+
                              |
              +---------------+---------------+
              |                               |
    +---------+--------+           +----------+---------+
    |  VSCode Extension |           |    Mobile App      |
    |  (Local Server)   |<-- WiFi ->|  (React Native)   |
    +------------------+           +--------------------+
```

### Components

- **VSCode Extension** (`vscode-extension/`): WebSocket server for local connections, relay client for remote access
- **Relay Server** (`relay-server/`): Socket.IO server for message routing, Redis for session management
- **Mobile App** (`mobile-app/`): Expo React Native app for iOS and Android
- **Shared** (`shared/`): Common TypeScript types and protocols

## Quick Start

### Prerequisites

- Node.js 18+
- Redis (for relay server)
- Expo CLI (`npm install -g expo-cli`)

### Installation

```bash
# Clone the repository
git clone https://github.com/nzrgroup/nzr-dev-plugin.git
cd nzr-dev-plugin

# Install all dependencies
npm install

# Build shared types
npm run build -w @nzr-dev/shared
```

### Development

#### VSCode Extension

```bash
# Build the extension
npm run build -w nzr-dev-vscode

# Launch VSCode with extension
cd vscode-extension
code --extensionDevelopmentPath=.
```

#### Relay Server

```bash
# Set environment variables
export REDIS_URL=redis://localhost:6379
export JWT_SECRET=your-secret-key
export PORT=3000

# Start the server
npm run dev -w nzr-dev-relay
```

#### Mobile App

```bash
# Start Expo development server
npm run start -w nzr-dev-mobile

# Or directly
cd mobile-app
expo start
```

### Docker Deployment (Relay Server)

```bash
cd relay-server
docker build -t nzr-relay .
docker run -p 3001:3001 -e REDIS_URL=redis://redis:6379 -e JWT_SECRET=secret nzr-relay
```

## Features

### Device Pairing (US1)
- QR code pairing from VSCode to mobile
- PIN fallback for manual entry
- Secure JWT authentication

### File Browsing (US2)
- Browse project files with syntax highlighting
- Fast local WiFi connection via mDNS discovery
- Support for large codebases

### Remote Access (US3)
- Access VSCode from anywhere via relay server
- Automatic fallback when local network unavailable
- End-to-end encrypted communication

### Terminal Execution (US4)
- Execute commands remotely
- Stream output in real-time
- Multiple terminal sessions
- Ctrl+C support for process interruption

### AI Integration (US5)
- Chat with Claude Code, Copilot, or Codeium
- Streaming responses
- Context-aware suggestions

### Notifications (US6)
- Push notifications for build errors
- Diagnostic alerts
- Customizable notification preferences

### Code Editing (US7)
- Edit files from mobile
- Syntax highlighting
- Save with unsaved changes indicator

## Configuration

### VSCode Extension Settings

```json
{
  "nzr-dev.localServer.port": 8765,
  "nzr-dev.localServer.host": "0.0.0.0",
  "nzr-dev.relay.url": "https://relay.nzr.dev",
  "nzr-dev.relay.autoConnect": true
}
```

### Environment Variables (Relay Server)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `REDIS_URL` | Redis connection URL | redis://localhost:6379 |
| `JWT_SECRET` | JWT signing secret | (required) |
| `CORS_ORIGINS` | Allowed origins | * |
| `NODE_ENV` | Environment | development |

## Project Structure

```
nzr-dev-plugin/
├── shared/                 # Shared types and protocols
│   └── src/
│       └── types/
│           ├── protocol.ts # Message protocol types
│           └── entities.ts # Entity definitions
├── vscode-extension/       # VSCode extension
│   └── src/
│       ├── services/       # Business logic
│       ├── server/         # WebSocket server
│       ├── views/          # Webview panels
│       └── utils/          # Utilities
├── relay-server/           # Cloud relay server
│   └── src/
│       ├── services/       # Redis, relay, notifications
│       ├── routes/         # API endpoints
│       └── middleware/     # Auth, rate limiting
├── mobile-app/             # React Native mobile app
│   └── src/
│       ├── screens/        # App screens
│       ├── components/     # Reusable components
│       ├── services/       # API clients
│       └── contexts/       # React contexts
└── specs/                  # Feature specifications
```

## Security

- JWT-based authentication with refresh tokens
- Rate limiting on all API endpoints
- Encrypted WebSocket connections (WSS)
- Secure token storage on mobile (expo-secure-store)
- Redis session management with TTL

## License

MIT
