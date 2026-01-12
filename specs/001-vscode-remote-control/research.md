# Research: NZR Dev Plugin - VSCode Remote Control

**Date**: 2026-01-12
**Branch**: `001-vscode-remote-control`
**Status**: Complete

## Research Areas

### 1. VSCode Extension API - WebSocket Server Integration

**Decision**: Use the `ws` library with Express for HTTP endpoints within VSCode extension

**Rationale**:
- VSCode extensions run in a Node.js environment, allowing native WebSocket libraries
- The `ws` library is lightweight, performant, and well-maintained
- Express can coexist for REST endpoints (discovery, health checks)
- VSCode Extension API provides `vscode.window`, `vscode.workspace`, `vscode.commands` for editor integration

**Alternatives Considered**:
- Socket.IO in extension: Rejected - adds unnecessary overhead for local connections
- VSCode's built-in WebView messaging: Rejected - designed for UI panels, not external clients

**Key Implementation Notes**:
- Use `context.subscriptions` for cleanup on deactivation
- Server must bind to `localhost` or configurable interface
- Port selection: Use environment variable or settings, fallback to dynamic port

### 2. Local Network Service Discovery (mDNS/Bonjour)

**Decision**: Use `bonjour-service` npm package for cross-platform mDNS

**Rationale**:
- Works on Windows, macOS, and Linux without native dependencies
- Pure JavaScript implementation avoids native build issues
- Widely used in similar applications (VS Code Live Share uses similar approach)
- Can advertise both HTTP (discovery) and WS (commands) endpoints

**Alternatives Considered**:
- `mdns` (native): Rejected - requires native compilation, complex setup
- Manual UDP broadcast: Rejected - reinventing wheel, less reliable
- Multicast DNS from scratch: Rejected - too low level

**Service Registration**:
```
Service Type: _nzr-dev._tcp
Service Name: NZR-Dev-{workspaceName}
TXT Records:
  - wsPort={port}
  - workspaceId={uuid}
  - version={extensionVersion}
```

### 3. WebSocket Protocol: Raw WS vs Socket.IO

**Decision**: Use raw WebSocket (`ws`) for local connections, Socket.IO for relay server

**Rationale**:
- **Local (raw WS)**:
  - Lower latency (no Socket.IO protocol overhead)
  - Simpler implementation for direct connections
  - No fallback needed on local network
- **Relay (Socket.IO)**:
  - Built-in reconnection handling
  - Automatic fallback to HTTP long-polling if WebSocket blocked
  - Room-based message routing perfect for device pairing
  - Namespaces for separating concerns (auth, relay, notifications)

**Alternatives Considered**:
- Socket.IO everywhere: Rejected - unnecessary overhead for local
- Raw WS everywhere: Rejected - lacks fallback for corporate firewalls

### 4. Mobile App: React Native + Expo

**Decision**: Use Expo managed workflow with `expo-camera` for QR scanning

**Rationale**:
- Expo simplifies build/deploy for both iOS and Android
- `expo-camera` provides cross-platform QR code scanning
- `expo-secure-store` for secure token storage
- OTA updates possible without app store review
- React Native Paper provides Material Design components

**Alternatives Considered**:
- Flutter: Rejected - team expertise in React, TypeScript shared across stack
- Native Swift/Kotlin: Rejected - doubles development effort
- PWA: Rejected - limited camera access, no push notifications on iOS

**Key Libraries**:
- `expo-camera` + `expo-barcode-scanner`: QR code scanning
- `socket.io-client`: Relay server connection
- `react-native-websocket`: Direct local WebSocket (fallback)
- `@react-navigation/native`: Screen navigation
- `react-native-paper`: UI components
- `expo-notifications`: Push notification handling

### 5. Authentication & Session Management

**Decision**: JWT tokens with Redis-backed sessions on relay server

**Rationale**:
- JWT allows stateless verification on VSCode extension
- Redis provides:
  - Session storage with automatic expiration (TTL)
  - Pub/Sub for real-time device status
  - Fast lookups for device-to-device routing
- Pairing flow:
  1. Extension generates short-lived pairing token (5 min TTL)
  2. Mobile scans QR → exchanges pairing token for session JWT
  3. JWT includes device ID, workspace ID, permissions
  4. Refresh tokens for long sessions (24h access, 7d refresh)

**Alternatives Considered**:
- Session cookies: Rejected - not suitable for mobile apps
- API keys: Rejected - less secure, no expiration semantics
- OAuth2: Rejected - overengineered for single-user scenarios

**Security Measures**:
- Pairing tokens: 32-byte random, hashed before storage
- PIN fallback: 6-digit numeric, 5 attempts max, 15-min lockout
- JWT signing: RS256 (asymmetric) for relay, HS256 for local
- Rate limiting: 10 pairing attempts/hour per IP

### 6. Push Notifications

**Decision**: Firebase Cloud Messaging (FCM) for Android, Apple Push Notification service (APNs) for iOS, unified via Firebase

**Rationale**:
- Firebase provides unified SDK for both platforms
- Expo Push Notifications wraps this complexity
- Relay server stores device push tokens
- Notification types: diagnostic errors, build failures, AI responses

**Alternatives Considered**:
- Direct APNs/FCM integration: Rejected - more complexity
- OneSignal: Rejected - additional vendor dependency
- WebSocket-only: Rejected - doesn't work when app is backgrounded

**Implementation Notes**:
- Use Expo Push Token for abstraction
- Relay server calls Expo Push API
- Batch notifications to prevent spam (aggregate diagnostics)

### 7. AI Extension Integration

**Decision**: Use VSCode command API to interact with AI extensions

**Rationale**:
- Claude Code and GitHub Copilot Chat expose VSCode commands
- Extension can execute commands programmatically
- Response captured via output channel or webview messaging

**Alternatives Considered**:
- Direct API calls to AI services: Rejected - bypasses user's configured API keys
- Extension message passing: Limited - requires AI extension cooperation

**Integration Approach**:
```typescript
// Detect available AI extensions
const claudeCode = vscode.extensions.getExtension('anthropic.claude-code');
const copilotChat = vscode.extensions.getExtension('github.copilot-chat');

// Send message via command
await vscode.commands.executeCommand('claude-code.sendMessage', { message });
```

**Limitations**:
- Streaming responses may require polling or webview integration
- Not all AI extensions expose public commands
- Fallback: Display "AI not available" if no compatible extension found

### 8. Terminal Integration

**Decision**: Use VSCode Terminal API with PTY streaming

**Rationale**:
- `vscode.window.createTerminal()` creates managed terminals
- `Terminal.sendText()` for command execution
- Custom PTY provider via `vscode.window.registerTerminalProfileProvider`
- Output capture via `onDidWriteTerminalData` event

**Alternatives Considered**:
- Child process spawn: Rejected - loses VSCode terminal integration
- External terminal emulator: Rejected - not integrated with workspace

**Implementation Notes**:
- Terminal sessions persist across reconnections
- Buffer recent output (last 1000 lines) for mobile sync
- Support multiple concurrent terminals (tab-based UI on mobile)

### 9. Code Syntax Highlighting (Mobile)

**Decision**: Use `react-native-syntax-highlighter` with Prism.js

**Rationale**:
- Prism.js supports 200+ languages
- React Native wrapper handles text rendering
- Theme support matches VSCode themes (dark/light)

**Alternatives Considered**:
- Server-side highlighting: Rejected - adds latency
- WebView with Monaco: Rejected - heavy, battery-intensive
- Custom highlighter: Rejected - massive undertaking

**Performance Notes**:
- Limit file preview to 5000 lines
- Lazy load syntax definitions
- Cache highlighted output for scrolling

### 10. Data Synchronization Strategy

**Decision**: Event-driven synchronization with optimistic updates

**Rationale**:
- Mobile sends commands, receives events
- No persistent sync state - mobile is a "view" into VSCode
- Cursor position, selection, active file pushed via events
- File content fetched on-demand (not cached long-term)

**Alternatives Considered**:
- Full file sync: Rejected - storage and bandwidth concerns
- Operational transforms: Rejected - overengineered for viewing
- CRDT: Rejected - unnecessary for single-source-of-truth model

## Summary of Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| VSCode Extension | TypeScript, ws, Express, bonjour-service | TS 5.x |
| Relay Server | Node.js, Express, Socket.IO, Redis, JWT | Node 20.x |
| Mobile App | React Native, Expo, Socket.IO Client | RN 0.73+ |
| QR Scanning | expo-camera, expo-barcode-scanner | Expo SDK 50+ |
| Push Notifications | Firebase (via Expo Push) | Latest |
| Code Highlighting | react-native-syntax-highlighter | Latest |

## Open Questions Resolved

All NEEDS CLARIFICATION items from technical context have been resolved:
- Language/Version: TypeScript 5.x across all components
- Dependencies: Documented per component above
- Storage: Redis for relay, AsyncStorage for mobile
- Testing: Jest-based with platform-specific extensions
- Performance: Targets defined (500ms local, 2s relay)

**Research Status**: Complete - Ready for Phase 1 Design
