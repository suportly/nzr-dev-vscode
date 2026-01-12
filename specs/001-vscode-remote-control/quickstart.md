# Quickstart Guide: NZR Dev Plugin

**Date**: 2026-01-12
**Branch**: `001-vscode-remote-control`

## Overview

This guide helps you set up the NZR Dev Plugin development environment and run all three components locally.

## Prerequisites

- **Node.js**: 20.x LTS
- **npm**: 10.x or **pnpm**: 8.x
- **VSCode**: Latest stable version
- **Expo CLI**: `npm install -g expo-cli`
- **Redis**: Running locally or via Docker
- **iOS Simulator** (macOS) or **Android Emulator**

## Repository Structure

```
nzr-dev-plugin/
├── vscode-extension/    # VSCode extension
├── relay-server/        # Cloud relay server
├── mobile-app/          # React Native mobile app
├── shared/              # Shared TypeScript types
└── specs/               # Feature specifications
```

## Quick Setup

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/nzrgroup/nzr-dev-plugin.git
cd nzr-dev-plugin

# Install all dependencies (from root)
npm install

# Or install each component separately
cd vscode-extension && npm install && cd ..
cd relay-server && npm install && cd ..
cd mobile-app && npm install && cd ..
```

### 2. Start Redis (for relay server)

```bash
# Using Docker
docker run -d -p 6379:6379 --name redis redis:alpine

# Or if Redis is installed locally
redis-server
```

### 3. Configure Environment

**Relay Server** (`relay-server/.env`):
```env
PORT=3001
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-development-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
EXPO_ACCESS_TOKEN=your-expo-token  # Optional for push notifications
```

**VSCode Extension** (`vscode-extension/.env`):
```env
RELAY_URL=http://localhost:3001
WS_PORT=3002
```

**Mobile App** (`mobile-app/.env`):
```env
RELAY_URL=http://localhost:3001
```

### 4. Start Development Servers

Open three terminal windows:

**Terminal 1 - Relay Server**:
```bash
cd relay-server
npm run dev
# Server starts on http://localhost:3001
```

**Terminal 2 - VSCode Extension**:
```bash
cd vscode-extension
npm run watch
# Then press F5 in VSCode to launch Extension Development Host
```

**Terminal 3 - Mobile App**:
```bash
cd mobile-app
npx expo start
# Scan QR code with Expo Go app or press 'i' for iOS / 'a' for Android
```

## Testing the Connection

### Step 1: Generate Pairing QR Code

In the Extension Development Host VSCode window:
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run command: `NZR Dev: Generate Pairing QR Code`
3. A QR code panel will appear

### Step 2: Connect Mobile App

1. Open the mobile app on your device/simulator
2. Tap "Connect to VSCode"
3. Scan the QR code (or enter the PIN displayed below it)
4. Wait for "Connected" confirmation

### Step 3: Verify Connection

On the mobile app:
- Navigate to the "Files" tab to see the workspace file tree
- Open a file to view its contents with syntax highlighting
- Go to "Terminal" tab and run a command (e.g., `echo "Hello from mobile!"`)

In VSCode, you should see:
- Status bar showing "NZR: 1 device connected"
- The command executed in the integrated terminal

## Development Workflow

### Running Tests

```bash
# All tests
npm test

# Component-specific
cd vscode-extension && npm test
cd relay-server && npm test
cd mobile-app && npm test
```

### Type Checking

```bash
# All components
npm run typecheck

# Single component
cd vscode-extension && npm run typecheck
```

### Linting

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

## Common Issues

### "Cannot connect to relay server"

- Verify Redis is running: `redis-cli ping` should return `PONG`
- Check relay server logs for errors
- Ensure `.env` files are configured

### "QR code not scanning"

- Ensure mobile and computer are on same network (for local connections)
- Try using the PIN code instead
- Check camera permissions in mobile app

### "Extension not loading"

- Run `npm run compile` in vscode-extension directory
- Check Output panel (View → Output → "NZR Dev Plugin") for errors
- Try reloading the Extension Development Host window

### "Mobile app crashes on start"

- Clear Expo cache: `npx expo start --clear`
- Ensure you're using Expo SDK 50+ compatible Node version
- Check that all dependencies are installed

## Architecture Notes

### Local vs Relay Connections

- **Local**: Direct WebSocket connection when on same network (faster)
- **Relay**: Through cloud server when on different networks (works everywhere)

The mobile app automatically prefers local connections when available.

### Authentication Flow

```
1. VSCode Extension → Relay: "Create pairing session"
2. Relay → Extension: Pairing token + QR data
3. Mobile scans QR → Relay: "Complete pairing with token"
4. Relay → Mobile: JWT access + refresh tokens
5. Mobile → Extension: Direct WebSocket with JWT (local)
   OR Mobile → Relay → Extension: Relayed messages (remote)
```

### Message Flow

```
Mobile App                    Extension
    |                            |
    |-- Command (JSON) -------->|
    |                            |-- Process
    |<-- Response (JSON) -------|
    |                            |
    |<-- Event (JSON) ----------| (push updates)
```

## Next Steps

1. **Read the Spec**: [spec.md](./spec.md) - Full feature requirements
2. **Review Data Model**: [data-model.md](./data-model.md) - Entity definitions
3. **Check API Contracts**: [contracts/](./contracts/) - Protocol specifications
4. **Generate Tasks**: Run `/speckit.tasks` to create implementation tasks

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services in development mode |
| `npm run build` | Build all components for production |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Remove all build artifacts |
| `npm run package` | Package VSCode extension as .vsix |
