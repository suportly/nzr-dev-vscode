# Tasks: NZR Dev Plugin - VSCode Remote Control

**Input**: Design documents from `/specs/001-vscode-remote-control/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested in specification - skipping test tasks.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize monorepo structure with all three components

- [x] T001 Create root package.json with workspaces config for monorepo
- [x] T002 [P] Create shared/ directory with package.json for shared TypeScript types
- [x] T003 [P] Create vscode-extension/package.json with VSCode extension manifest
- [x] T004 [P] Create relay-server/package.json with Express/Socket.IO dependencies
- [x] T005 [P] Create mobile-app/package.json with Expo configuration
- [x] T006 [P] Create shared/tsconfig.json with base TypeScript config
- [x] T007 [P] Create vscode-extension/tsconfig.json extending shared config
- [x] T008 [P] Create relay-server/tsconfig.json extending shared config
- [x] T009 [P] Create mobile-app/tsconfig.json for React Native
- [x] T010 Configure ESLint and Prettier at root level with .eslintrc.js and .prettierrc
- [x] T011 Create .gitignore with node_modules, dist, .env patterns

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**CRITICAL**: No user story work can begin until this phase is complete

### Shared Types

- [x] T012 [P] Define Message base interface in shared/src/types/protocol.ts
- [x] T013 [P] Define Command interface with category/action/payload in shared/src/types/protocol.ts
- [x] T014 [P] Define Event interface with type/data in shared/src/types/protocol.ts
- [x] T015 [P] Define Response/ErrorResponse interfaces in shared/src/types/protocol.ts
- [x] T016 [P] Define Device entity interface in shared/src/types/entities.ts
- [x] T017 [P] Define Session entity interface in shared/src/types/entities.ts
- [x] T018 [P] Define Connection entity interface in shared/src/types/entities.ts
- [x] T019 [P] Define Workspace entity interface in shared/src/types/entities.ts
- [x] T020 [P] Define PairingToken entity interface in shared/src/types/entities.ts
- [x] T021 Create shared/src/index.ts exporting all types

### VSCode Extension Foundation

- [x] T022 Create vscode-extension/src/extension.ts with activate/deactivate stubs
- [x] T023 [P] Create vscode-extension/src/utils/logger.ts for extension logging
- [x] T024 [P] Create vscode-extension/src/utils/config.ts for extension settings
- [x] T025 Update vscode-extension/package.json with activation events and commands

### Relay Server Foundation

- [x] T026 Create relay-server/src/index.ts with Express server setup
- [x] T027 [P] Create relay-server/src/config/index.ts for environment configuration
- [x] T028 [P] Create relay-server/src/utils/logger.ts for server logging
- [x] T029 Create relay-server/src/services/redis.ts for Redis client connection
- [x] T030 Create relay-server/Dockerfile for containerized deployment

### Mobile App Foundation

- [x] T031 Create mobile-app/App.tsx with React Navigation container
- [x] T032 [P] Create mobile-app/src/services/storage.ts AsyncStorage wrapper
- [x] T033 [P] Create mobile-app/src/contexts/ConnectionContext.tsx with connection state
- [x] T034 Create mobile-app/app.json with Expo configuration

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Initial Device Pairing (Priority: P1) MVP

**Goal**: Enable secure device pairing via QR code scanning between VSCode and mobile app

**Independent Test**: Generate QR code in VSCode, scan with mobile app, verify "Connection established" message

### VSCode Extension - Pairing

- [x] T035 [P] [US1] Create vscode-extension/src/utils/auth.ts with token generation functions
- [x] T036 [P] [US1] Create vscode-extension/src/utils/qrcode.ts for QR code generation
- [x] T037 [US1] Create vscode-extension/src/services/pairing.ts with PairingService class
- [x] T038 [US1] Create vscode-extension/src/views/QRCodePanel.ts for WebView panel display
- [x] T039 [US1] Register "nzr-dev.generatePairingCode" command in extension.ts
- [x] T040 [US1] Implement token expiration (5 min) and PIN fallback in pairing.ts

### Relay Server - Auth Endpoints

- [x] T041 [P] [US1] Create relay-server/src/middleware/auth.ts with JWT middleware
- [x] T042 [P] [US1] Create relay-server/src/services/jwt.ts for token signing/verification
- [x] T043 [US1] Create relay-server/src/routes/auth.ts with /pair/init endpoint
- [x] T044 [US1] Add /pair/complete endpoint in relay-server/src/routes/auth.ts
- [x] T045 [US1] Add /auth/refresh endpoint in relay-server/src/routes/auth.ts
- [x] T046 [US1] Create relay-server/src/services/pairing.ts for token storage in Redis

### Mobile App - Pairing Screen

- [x] T047 [P] [US1] Create mobile-app/src/screens/PairingScreen.tsx with camera setup
- [x] T048 [US1] Implement QR code scanner using expo-camera in PairingScreen.tsx
- [x] T049 [US1] Create mobile-app/src/services/auth.ts for token exchange
- [x] T050 [US1] Add PIN entry fallback UI in PairingScreen.tsx
- [x] T051 [US1] Store tokens securely using expo-secure-store in auth.ts
- [x] T052 [US1] Update ConnectionContext.tsx with pairing state management

**Checkpoint**: Device pairing functional - can pair devices via QR code or PIN

---

## Phase 4: User Story 2 - Local Network File Browsing (Priority: P1) MVP

**Goal**: Browse and view project files from mobile on local network with low latency

**Independent Test**: Connect to same WiFi, browse file tree, open file and see syntax highlighting

### VSCode Extension - WebSocket Server & File Service

- [x] T053 [P] [US2] Create vscode-extension/src/server/websocket.ts with ws server setup
- [x] T054 [P] [US2] Create vscode-extension/src/utils/discovery.ts with bonjour-service mDNS
- [x] T055 [US2] Create vscode-extension/src/services/files.ts with FilesService class
- [x] T056 [US2] Implement listFiles method in files.ts using vscode.workspace.fs
- [x] T057 [US2] Implement readFile method with encoding support in files.ts
- [x] T058 [US2] Create vscode-extension/src/server/handlers.ts with command router
- [x] T059 [US2] Implement file command handlers (list, read, open) in handlers.ts
- [x] T060 [US2] Add JWT validation for WebSocket connections in websocket.ts
- [x] T061 [US2] Register mDNS service on extension activation in extension.ts

### VSCode Extension - Editor Service

- [x] T062 [P] [US2] Create vscode-extension/src/services/editor.ts with EditorService class
- [x] T063 [US2] Implement getState method returning active file and cursor in editor.ts
- [x] T064 [US2] Implement editor state event emitter in editor.ts
- [x] T065 [US2] Add editor command handlers in handlers.ts

### Mobile App - Connection & File Browsing

- [x] T066 [P] [US2] Create mobile-app/src/services/socket.ts with WebSocket client
- [x] T067 [US2] Implement local network discovery using react-native-zeroconf in socket.ts
- [x] T068 [US2] Create mobile-app/src/services/vscode-api.ts with command abstraction
- [x] T069 [US2] Implement file commands (list, read, open) in vscode-api.ts
- [x] T070 [US2] Create mobile-app/src/screens/HomeScreen.tsx with connection list
- [x] T071 [US2] Create mobile-app/src/components/FileTree.tsx with recursive navigation
- [x] T072 [US2] Create mobile-app/src/components/CodeViewer.tsx with syntax highlighting
- [x] T073 [US2] Create mobile-app/src/screens/EditorScreen.tsx integrating CodeViewer
- [x] T074 [US2] Add auto-reconnection logic in socket.ts

**Checkpoint**: Local file browsing functional - can browse and view code on mobile

---

## Phase 5: User Story 3 - Remote Internet Access (Priority: P2)

**Goal**: Access VSCode from outside local network via relay server

**Independent Test**: Disconnect from local WiFi, connect via mobile data, verify file operations work

### Relay Server - Message Relay

- [x] T075 [P] [US3] Create relay-server/src/services/relay.ts with RelayService class
- [x] T076 [US3] Setup Socket.IO server with /device namespace in index.ts
- [x] T077 [US3] Implement room-based routing (workspace-{id}) in relay.ts
- [x] T078 [US3] Create relay-server/src/routes/devices.ts for device registration
- [x] T079 [US3] Add device online status tracking in Redis via relay.ts
- [x] T080 [US3] Implement message forwarding between VSCode and mobile in relay.ts

### VSCode Extension - Relay Client

- [x] T081 [P] [US3] Create vscode-extension/src/services/relay-client.ts with Socket.IO client
- [x] T082 [US3] Implement relay connection on extension activation in extension.ts
- [x] T083 [US3] Forward local WebSocket messages through relay in relay-client.ts
- [x] T084 [US3] Add relay status indicator to VSCode status bar

### Mobile App - Relay Connection

- [x] T085 [P] [US3] Add Socket.IO client setup in mobile-app/src/services/socket.ts
- [x] T086 [US3] Implement connection type detection (local vs relay) in socket.ts
- [x] T087 [US3] Add connection preference (auto, local-only, relay-only) in settings
- [x] T088 [US3] Update HomeScreen.tsx to show connection type indicator

**Checkpoint**: Remote access functional - can connect from anywhere via relay

---

## Phase 6: User Story 4 - Remote Terminal Execution (Priority: P2)

**Goal**: Execute terminal commands on VSCode machine from mobile with streaming output

**Independent Test**: Send `npm test` command, verify output streams back in real-time

### VSCode Extension - Terminal Service

- [x] T089 [P] [US4] Create vscode-extension/src/services/terminal.ts with TerminalService
- [x] T090 [US4] Implement listTerminals method in terminal.ts
- [x] T091 [US4] Implement createTerminal method with name/cwd options in terminal.ts
- [x] T092 [US4] Implement executeCommand method with output capture in terminal.ts
- [x] T093 [US4] Implement sendInput method for control signals (Ctrl+C) in terminal.ts
- [x] T094 [US4] Add terminal output streaming via events in terminal.ts
- [x] T095 [US4] Register terminal command handlers in handlers.ts

### Mobile App - Terminal Screen

- [x] T096 [P] [US4] Create mobile-app/src/screens/TerminalScreen.tsx layout
- [x] T097 [US4] Implement terminal output display with scrolling in TerminalScreen.tsx
- [x] T098 [US4] Add command input with send button in TerminalScreen.tsx
- [x] T099 [US4] Implement terminal session tabs for multiple terminals
- [x] T100 [US4] Add Ctrl+C button for process interruption in TerminalScreen.tsx
- [x] T101 [US4] Implement terminal commands in vscode-api.ts

**Checkpoint**: Terminal functional - can execute commands and see streaming output

---

## Phase 7: User Story 5 - AI Assistant Integration (Priority: P3)

**Goal**: Chat with AI assistants (Claude Code, Copilot) from mobile

**Independent Test**: Send "Explain this code" message, verify AI response appears

### VSCode Extension - AI Bridge

- [x] T102 [P] [US5] Create vscode-extension/src/services/ai-bridge.ts with AIBridgeService
- [x] T103 [US5] Implement AI extension detection in ai-bridge.ts
- [x] T104 [US5] Implement sendMessage method using vscode.commands in ai-bridge.ts
- [x] T105 [US5] Add streaming response capture in ai-bridge.ts
- [x] T106 [US5] Register AI command handlers in handlers.ts

### Mobile App - AI Chat Screen

- [x] T107 [P] [US5] Create mobile-app/src/screens/AIChatScreen.tsx layout
- [x] T108 [P] [US5] Create mobile-app/src/components/ChatMessage.tsx for message bubbles
- [x] T109 [US5] Implement chat history display in AIChatScreen.tsx
- [x] T110 [US5] Add message input with send functionality in AIChatScreen.tsx
- [x] T111 [US5] Implement streaming response display in AIChatScreen.tsx
- [x] T112 [US5] Add AI unavailable state handling in AIChatScreen.tsx
- [x] T113 [US5] Implement AI commands in vscode-api.ts

**Checkpoint**: AI chat functional - can interact with VSCode AI extensions

---

## Phase 8: User Story 6 - Real-time Notifications (Priority: P3)

**Goal**: Receive push notifications on mobile for VSCode events (errors, builds)

**Independent Test**: Trigger TypeScript error, verify push notification arrives on mobile

### Relay Server - Push Notifications

- [x] T114 [P] [US6] Create relay-server/src/services/notifications.ts with NotificationService
- [x] T115 [US6] Implement Expo Push API integration in notifications.ts
- [x] T116 [US6] Add /notifications/send endpoint in relay-server/src/routes/notifications.ts
- [x] T117 [US6] Add push token storage/update endpoint in devices.ts

### VSCode Extension - Event Emitter

- [x] T118 [P] [US6] Create vscode-extension/src/services/diagnostics.ts for diagnostic monitoring
- [x] T119 [US6] Implement diagnostic change listener in diagnostics.ts
- [x] T120 [US6] Send notification events through relay for errors in diagnostics.ts
- [x] T121 [US6] Add notification throttling/batching in diagnostics.ts

### Mobile App - Notifications

- [x] T122 [P] [US6] Setup expo-notifications in mobile-app/App.tsx
- [x] T123 [US6] Implement push token registration on app start
- [x] T124 [US6] Create mobile-app/src/screens/SettingsScreen.tsx with notification preferences
- [x] T125 [US6] Handle notification tap to navigate to relevant screen

**Checkpoint**: Notifications functional - receive push alerts for VSCode events

---

## Phase 9: User Story 7 - Code Editing (Priority: P4)

**Goal**: Make small code edits from mobile device

**Independent Test**: Open file, enable edit mode, change a line, save, verify in VSCode

### VSCode Extension - Editor Write Operations

- [x] T126 [P] [US7] Implement insertText method in vscode-extension/src/services/editor.ts
- [x] T127 [US7] Implement replaceText method in editor.ts
- [x] T128 [US7] Add editor write command handlers in handlers.ts

### VSCode Extension - File Write

- [x] T129 [P] [US7] Implement writeFile method in vscode-extension/src/services/files.ts
- [x] T130 [US7] Add file write command handler in handlers.ts

### Mobile App - Edit Mode

- [x] T131 [P] [US7] Add edit mode toggle to mobile-app/src/components/CodeViewer.tsx
- [x] T132 [US7] Implement editable text input for code in CodeViewer.tsx
- [x] T133 [US7] Add save button with unsaved changes indicator
- [x] T134 [US7] Implement save confirmation dialog on navigation
- [x] T135 [US7] Add file write commands in vscode-api.ts

**Checkpoint**: Code editing functional - can make and save edits from mobile

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements across all components

- [x] T136 [P] Add comprehensive error handling in vscode-extension/src/server/websocket.ts
- [x] T137 [P] Add rate limiting middleware in relay-server/src/middleware/rateLimit.ts
- [x] T138 [P] Implement connection timeout handling in mobile-app/src/services/socket.ts
- [x] T139 Add security logging in relay-server/src/utils/logger.ts
- [x] T140 Create README.md at repository root with setup instructions
- [x] T141 Update quickstart.md validation - run through all steps
- [x] T142 [P] Add loading states to all mobile screens
- [x] T143 [P] Add error boundary component in mobile-app/src/components/ErrorBoundary.tsx
- [x] T144 Performance optimization for large file handling in files.ts
- [x] T145 Add offline detection and messaging in mobile app

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → [User Stories can run in parallel]
                                          ├─→ Phase 3 (US1: Pairing)
                                          ├─→ Phase 4 (US2: File Browsing) [needs US1 for auth]
                                          ├─→ Phase 5 (US3: Remote Access) [needs US1, US2]
                                          ├─→ Phase 6 (US4: Terminal) [needs US2 for connection]
                                          ├─→ Phase 7 (US5: AI) [needs US2 for connection]
                                          ├─→ Phase 8 (US6: Notifications) [needs US3 for relay]
                                          └─→ Phase 9 (US7: Editing) [needs US2 for viewing]
                                                          ↓
                                               Phase 10 (Polish)
```

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 (Pairing) | Foundational | Phase 2 complete |
| US2 (File Browsing) | US1 | US1 pairing works |
| US3 (Remote Access) | US1, US2 | Local connection works |
| US4 (Terminal) | US2 | File browsing connection works |
| US5 (AI Chat) | US2 | File browsing connection works |
| US6 (Notifications) | US3 | Relay server works |
| US7 (Code Editing) | US2 | File viewing works |

### Parallel Opportunities

**Within Setup (Phase 1)**:
```
T002, T003, T004, T005 (all package.json files)
T006, T007, T008, T009 (all tsconfig files)
```

**Within Foundational (Phase 2)**:
```
T012-T020 (all shared type definitions)
T022-T025 (extension foundation) || T026-T030 (relay foundation) || T031-T034 (mobile foundation)
```

**Within US1 (Phase 3)**:
```
T035, T036 (extension utils) || T041, T042 (relay auth) || T047 (mobile screen)
```

**Within US2 (Phase 4)**:
```
T053, T054 (extension server) || T062 (editor service) || T066 (mobile socket)
```

---

## Parallel Example: User Story 2 Implementation

```bash
# Launch all extension services together:
Task: "Create vscode-extension/src/server/websocket.ts with ws server setup"
Task: "Create vscode-extension/src/utils/discovery.ts with bonjour-service mDNS"
Task: "Create vscode-extension/src/services/editor.ts with EditorService class"

# Launch mobile parallel tasks:
Task: "Create mobile-app/src/services/socket.ts with WebSocket client"
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (T001-T011)
2. Complete Phase 2: Foundational (T012-T034)
3. Complete Phase 3: US1 - Pairing (T035-T052)
4. Complete Phase 4: US2 - File Browsing (T053-T074)
5. **STOP and VALIDATE**: Pair devices and browse files
6. Deploy/demo if ready

**MVP Scope**: 74 tasks for fully functional local file browsing

### Incremental Delivery

| Increment | Stories | Total Tasks | Value Delivered |
|-----------|---------|-------------|-----------------|
| MVP | US1 + US2 | 74 | Pair and browse files locally |
| +Remote | US3 | 88 | Access from anywhere |
| +Terminal | US4 | 101 | Run commands remotely |
| +AI | US5 | 113 | Chat with AI assistants |
| +Notifications | US6 | 125 | Passive monitoring |
| +Editing | US7 | 135 | Make code changes |
| +Polish | All | 145 | Production ready |

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tasks** | 145 |
| **Setup Tasks** | 11 |
| **Foundational Tasks** | 23 |
| **US1 (Pairing) Tasks** | 18 |
| **US2 (File Browsing) Tasks** | 22 |
| **US3 (Remote Access) Tasks** | 14 |
| **US4 (Terminal) Tasks** | 13 |
| **US5 (AI Chat) Tasks** | 12 |
| **US6 (Notifications) Tasks** | 12 |
| **US7 (Editing) Tasks** | 10 |
| **Polish Tasks** | 10 |
| **Parallel Opportunities** | 47 tasks marked [P] |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story
- Each user story is independently testable after its phase completes
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP (US1 + US2) provides core value with 74 tasks
