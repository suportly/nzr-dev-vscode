# Implementation Plan: NZR Dev Plugin - VSCode Remote Control

**Branch**: `001-vscode-remote-control` | **Date**: 2026-01-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-vscode-remote-control/spec.md`

## Summary

A three-component system enabling remote VSCode control from mobile devices:
1. **VSCode Extension** - Local WebSocket server exposing editor, file, terminal, and AI operations
2. **Relay Server** - Cloud-based message relay for remote access with authentication
3. **Mobile App** - Cross-platform React Native application for iOS/Android

The system supports both local network (low-latency) and remote (internet) connections with secure device pairing via QR code/PIN.

## Technical Context

### VSCode Extension
**Language/Version**: TypeScript 5.x
**Primary Dependencies**: VSCode Extension API, ws (WebSocket), Express
**Testing**: Jest + VSCode Extension Test Framework
**Target Platform**: VSCode Desktop (Windows, macOS, Linux)

### Relay Server
**Language/Version**: Node.js 20.x LTS, TypeScript 5.x
**Primary Dependencies**: Express, Socket.IO, jsonwebtoken, Redis client
**Storage**: Redis (sessions, pub/sub)
**Testing**: Jest + Supertest
**Target Platform**: Linux server (Docker)

### Mobile App
**Language/Version**: TypeScript 5.x, React Native 0.73+
**Primary Dependencies**: Expo SDK 50+, Socket.IO Client, React Navigation 6, React Native Paper
**Storage**: AsyncStorage (local persistence)
**Testing**: Jest + React Native Testing Library + Detox (E2E)
**Target Platform**: iOS 14+, Android 8+ (API 26+)

### System-Wide
**Project Type**: Multi-component (extension + server + mobile)
**Performance Goals**:
- Local operations < 500ms
- Relay operations < 2s
- Terminal streaming latency < 100ms (local)
**Constraints**:
- Mobile battery impact < 5%/hour
- Support 100+ concurrent relay connections
- Session stability for 8+ hours
**Scale/Scope**: Single user per VSCode instance, multiple mobile devices per user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> Note: Project constitution uses template placeholders. Applying reasonable defaults:

| Principle | Status | Notes |
|-----------|--------|-------|
| Modular Design | PASS | Three independent components with clear boundaries |
| Security First | PASS | TLS/WSS encryption, JWT auth, PIN pairing defined |
| Test Coverage | PENDING | Test strategy defined per component |
| Documentation | PASS | Spec complete, plan in progress |

**Gate Status**: PASS - Proceeding to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/001-vscode-remote-control/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API specs)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
vscode-extension/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts              # Entry point, activation
│   ├── server/
│   │   ├── websocket.ts          # WebSocket server setup
│   │   └── handlers.ts           # Command handlers
│   ├── services/
│   │   ├── editor.ts             # Editor operations
│   │   ├── terminal.ts           # Terminal operations
│   │   ├── files.ts              # File system operations
│   │   └── ai-bridge.ts          # AI extension integration
│   └── utils/
│       ├── auth.ts               # Token generation, validation
│       └── discovery.ts          # mDNS/Bonjour registration
└── tests/
    ├── unit/
    └── integration/

relay-server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── src/
│   ├── index.ts                  # Server entry point
│   ├── routes/
│   │   ├── auth.ts               # Authentication endpoints
│   │   └── devices.ts            # Device registration
│   ├── services/
│   │   ├── relay.ts              # Message relay logic
│   │   └── notifications.ts      # Push notification service
│   └── middleware/
│       └── auth.ts               # JWT middleware
└── tests/
    ├── unit/
    └── integration/

mobile-app/
├── package.json
├── app.json
├── App.tsx
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx        # Connection list
│   │   ├── PairingScreen.tsx     # QR scanner
│   │   ├── EditorScreen.tsx      # Code viewer/editor
│   │   ├── TerminalScreen.tsx    # Remote terminal
│   │   ├── AIChatScreen.tsx      # AI assistant chat
│   │   └── SettingsScreen.tsx    # Preferences
│   ├── components/
│   │   ├── CodeViewer.tsx        # Syntax highlighted code
│   │   ├── FileTree.tsx          # Directory navigation
│   │   └── ChatMessage.tsx       # AI chat bubbles
│   ├── services/
│   │   ├── socket.ts             # WebSocket/Socket.IO client
│   │   ├── vscode-api.ts         # Command abstraction
│   │   └── storage.ts            # AsyncStorage wrapper
│   └── contexts/
│       └── ConnectionContext.tsx # Connection state
└── tests/
    ├── unit/
    └── e2e/
```

**Structure Decision**: Multi-component monorepo with three independent packages. Each component has its own package.json, test suite, and deployment pipeline. Shared types will be in a common `shared/` package.

## Complexity Tracking

| Component | Complexity | Justification |
|-----------|------------|---------------|
| Three separate codebases | Medium | Required by architecture (extension, server, mobile are different runtimes) |
| WebSocket + Socket.IO | Medium | Local uses raw WS for performance; relay uses Socket.IO for fallbacks |
| Redis for relay | Low | Standard choice for session management and pub/sub at scale |
