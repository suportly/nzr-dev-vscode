# Feature Specification: NZR Dev Plugin - VSCode Remote Control

**Feature Branch**: `001-vscode-remote-control`
**Created**: 2026-01-12
**Status**: Draft
**Input**: User description: "Sistema para controlar o VSCode remotamente via celular (iOS/Android), com integracao de IA"

## Overview

A comprehensive system enabling developers to remotely control their VSCode development environment from mobile devices (iOS and Android). The system provides secure access to editor functions, terminal commands, file navigation, and AI assistant integration through both local network (low-latency) and remote (internet) connections.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initial Device Pairing (Priority: P1)

A developer wants to connect their mobile phone to their VSCode instance for the first time. They open the VSCode extension which displays a QR code. Using the mobile app, they scan the QR code to establish a secure, authenticated connection.

**Why this priority**: This is the foundational user journey. Without successful pairing, no other functionality is accessible. It establishes the trust relationship between devices.

**Independent Test**: Can be fully tested by generating a QR code in VSCode and scanning it with the mobile app. Delivers value by confirming the secure connection channel works.

**Acceptance Scenarios**:

1. **Given** the VSCode extension is installed and active, **When** the user triggers the pairing command, **Then** a QR code with a unique token is displayed in the editor
2. **Given** the mobile app is installed, **When** the user scans a valid QR code, **Then** the app shows "Connection established" and the device appears in the authorized list
3. **Given** a QR code has been generated, **When** 5 minutes pass without scanning, **Then** the token expires and a new QR code must be generated
4. **Given** an invalid or expired QR code, **When** the user scans it, **Then** the app displays an appropriate error message

---

### User Story 2 - Local Network File Browsing (Priority: P1)

A developer on the same local network as their computer wants to browse project files and view code from their mobile device without any internet dependency.

**Why this priority**: File navigation is the core value proposition. Local network support provides the fastest, most reliable experience for developers working from the same location.

**Independent Test**: Can be tested by connecting a mobile device to the same WiFi network, browsing the file tree, and opening files to view their content.

**Acceptance Scenarios**:

1. **Given** the mobile device is on the same local network, **When** the app opens, **Then** it discovers the VSCode instance via service discovery within 5 seconds
2. **Given** a connected session, **When** the user navigates to a folder, **Then** the file tree displays all files and subdirectories
3. **Given** a file is selected, **When** the user taps to open it, **Then** the file content is displayed with syntax highlighting
4. **Given** network disconnection, **When** the connection drops, **Then** the app notifies the user and attempts reconnection automatically

---

### User Story 3 - Remote Internet Access (Priority: P2)

A developer away from their local network wants to access their VSCode environment through the internet using a relay server.

**Why this priority**: Extends the system's utility beyond local networks, enabling true remote work scenarios. Depends on P1 functionality working first.

**Independent Test**: Can be tested by connecting the mobile app from a different network (e.g., mobile data) and verifying all operations work through the relay.

**Acceptance Scenarios**:

1. **Given** the VSCode extension is connected to the relay server, **When** the mobile app connects from a remote network, **Then** the connection is established through the relay
2. **Given** a relay connection, **When** the user browses files, **Then** operations complete with acceptable latency (under 2 seconds for file listings)
3. **Given** both local and relay connections available, **When** the user is on the local network, **Then** the system prefers the local connection for lower latency

---

### User Story 4 - Remote Terminal Execution (Priority: P2)

A developer wants to execute terminal commands (e.g., run tests, start servers) on their development machine from their mobile device.

**Why this priority**: Terminal access enables critical development workflows like running builds and tests remotely, a key differentiator from simple file viewers.

**Independent Test**: Can be tested by sending a command (e.g., `npm test`) and verifying the output streams back to the mobile app in real-time.

**Acceptance Scenarios**:

1. **Given** a connected session, **When** the user opens the terminal screen, **Then** they see any active terminal sessions
2. **Given** the terminal screen, **When** the user types and sends a command, **Then** the command executes in VSCode and output streams to the mobile app
3. **Given** a long-running command, **When** output is generated, **Then** the mobile app displays it in real-time (streaming)
4. **Given** a running process, **When** the user sends Ctrl+C, **Then** the process terminates appropriately

---

### User Story 5 - AI Assistant Integration (Priority: P3)

A developer wants to interact with AI assistants (Claude Code, GitHub Copilot) installed in their VSCode from their mobile device.

**Why this priority**: AI integration enhances productivity but depends on the core connection and editor functionality. It's a value-add feature on top of the base system.

**Independent Test**: Can be tested by sending a message through the AI chat interface and receiving a response from the AI assistant.

**Acceptance Scenarios**:

1. **Given** an AI extension is active in VSCode, **When** the user opens the AI chat screen, **Then** they can see the AI assistant is available
2. **Given** the AI chat screen, **When** the user sends a message like "Explain this code", **Then** the message is forwarded to the AI and the response appears in the app
3. **Given** an AI response is streaming, **When** the AI generates text, **Then** the mobile app displays it progressively (not waiting for completion)
4. **Given** no AI extension is installed, **When** the user opens the AI chat, **Then** a message indicates no AI assistant is available

---

### User Story 6 - Real-time Notifications (Priority: P3)

A developer wants to receive push notifications on their mobile device when important events occur in VSCode (build errors, test failures, diagnostics).

**Why this priority**: Notifications enable passive monitoring without constantly checking the app. Useful but not essential for core functionality.

**Independent Test**: Can be tested by triggering a build error in VSCode and verifying a push notification arrives on the mobile device.

**Acceptance Scenarios**:

1. **Given** notification permissions are granted, **When** a build error occurs in VSCode, **Then** a push notification is sent to the mobile device
2. **Given** the app is in background, **When** diagnostic errors are detected, **Then** a notification summarizes the issue count
3. **Given** notification settings, **When** the user configures notification preferences, **Then** only selected event types trigger notifications

---

### User Story 7 - Code Editing (Priority: P4)

A developer wants to make small edits to code files from their mobile device.

**Why this priority**: Editing from mobile is challenging due to screen size and input limitations. It's a nice-to-have for quick fixes but not the primary use case.

**Independent Test**: Can be tested by making a single-line edit on mobile and verifying the change appears in the VSCode editor.

**Acceptance Scenarios**:

1. **Given** a file is open in the viewer, **When** the user taps edit mode, **Then** the file becomes editable
2. **Given** edit mode, **When** the user makes changes and saves, **Then** the changes are synced to the VSCode editor
3. **Given** unsaved changes, **When** the user navigates away, **Then** they are prompted to save or discard changes

---

### Edge Cases

- What happens when multiple VSCode windows are open? System should allow the user to select which workspace to control.
- How does the system handle large files? Files over a configurable threshold should display a warning and offer truncated preview.
- What happens when the same user tries to connect from multiple mobile devices? Both connections should be supported simultaneously.
- How does the system handle network transitions (WiFi to mobile data)? Connection should automatically switch with minimal interruption.
- What happens if the relay server is unavailable? Local network connections should continue to work; remote connections should show appropriate error.

## Requirements *(mandatory)*

### Functional Requirements

**Connection & Authentication**

- **FR-001**: System MUST generate a unique, time-limited pairing token encoded in a QR code
- **FR-002**: System MUST support secure WebSocket connections with encryption (TLS/WSS)
- **FR-003**: System MUST authenticate connections using JWT tokens
- **FR-004**: System MUST support PIN-based pairing as an alternative to QR codes (6-digit PIN)
- **FR-005**: System MUST maintain a list of authorized devices with ability to revoke access
- **FR-006**: System MUST enforce session expiration after configurable inactivity period (default: 24 hours)

**Discovery & Connectivity**

- **FR-007**: System MUST support local network device discovery (mDNS/Bonjour)
- **FR-008**: System MUST support relay server connections for remote access
- **FR-009**: System MUST automatically prefer local connections when available for lower latency
- **FR-010**: System MUST handle connection interruptions with automatic reconnection attempts

**File Operations**

- **FR-011**: System MUST list files and directories in the workspace
- **FR-012**: System MUST display file contents with syntax highlighting based on file type
- **FR-013**: System MUST support opening files in the VSCode editor from mobile
- **FR-014**: System MUST support basic file editing with save functionality
- **FR-015**: System MUST track and display the currently active file and cursor position

**Terminal Operations**

- **FR-016**: System MUST execute terminal commands sent from mobile
- **FR-017**: System MUST stream terminal output in real-time to mobile
- **FR-018**: System MUST support sending control signals (Ctrl+C, Ctrl+D)
- **FR-019**: System MUST support multiple concurrent terminal sessions

**AI Integration**

- **FR-020**: System MUST detect available AI extensions (Claude Code, GitHub Copilot Chat)
- **FR-021**: System MUST forward messages to AI extensions and relay responses
- **FR-022**: System MUST support streaming AI responses to mobile

**Notifications & Events**

- **FR-023**: System MUST emit events for editor state changes (file opened, cursor moved, selection changed)
- **FR-024**: System MUST emit events for diagnostic updates (errors, warnings)
- **FR-025**: System MUST support push notifications through the relay server
- **FR-026**: System MUST allow users to configure notification preferences

**Security**

- **FR-027**: System MUST encrypt all communications between components
- **FR-028**: System MUST validate all incoming commands before execution
- **FR-029**: System MUST log security-relevant events (connections, auth failures)
- **FR-030**: System MUST rate-limit connection attempts to prevent brute-force attacks

### Key Entities

- **Device**: Represents either a VSCode instance or a mobile client. Has attributes: device ID, device type (vscode/mobile), name, last connected timestamp, authorized status.

- **Connection**: Represents an active link between devices. Has attributes: connection ID, device pair, connection type (local/relay), established timestamp, encryption status.

- **Session**: Represents an authenticated user session. Has attributes: session ID, JWT token, device reference, creation time, expiration time, revocation status.

- **Command**: A request from mobile to VSCode. Has attributes: command ID, type (file/editor/terminal/ai/system), action, payload, timestamp.

- **Event**: A notification from VSCode to mobile. Has attributes: event type, data payload, timestamp.

- **Workspace**: The VSCode project being controlled. Has attributes: workspace path, name, active file, open terminals.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete device pairing in under 30 seconds from QR code display to successful connection
- **SC-002**: Local network file browsing operations (list, open) complete in under 500 milliseconds
- **SC-003**: Remote (relay) operations complete in under 2 seconds for typical file operations
- **SC-004**: Terminal command output appears on mobile within 100 milliseconds of being generated (local network)
- **SC-005**: AI chat responses begin streaming to mobile within 1 second of the AI starting to respond
- **SC-006**: System maintains stable connections for sessions lasting 8+ hours without manual reconnection
- **SC-007**: Push notifications arrive on mobile within 5 seconds of the triggering event
- **SC-008**: 95% of users can successfully pair and browse files on first attempt without documentation
- **SC-009**: System supports at least 100 concurrent relay connections per relay server instance
- **SC-010**: Battery impact on mobile device is less than 5% per hour of active use

## Assumptions

- Users have VSCode installed with the extension marketplace accessible
- Mobile devices have camera access for QR code scanning (or manual PIN entry as fallback)
- Users can install applications from App Store (iOS) and Google Play Store (Android)
- Local network allows device-to-device WebSocket connections (not blocked by firewall)
- For remote access, internet connectivity is available on both ends
- AI extensions (if used) expose some form of API or command interface for message passing
- Users understand basic VSCode concepts (workspaces, terminals, extensions)

## Scope Boundaries

**In Scope**:
- VSCode extension for the desktop editor
- Mobile application for iOS and Android
- Relay server for remote access
- File browsing and viewing
- Basic file editing
- Terminal command execution
- AI assistant message relay
- Push notifications for key events

**Out of Scope**:
- Support for other IDEs (JetBrains, Vim, etc.)
- Desktop-to-desktop remote control
- Video/screen sharing
- Voice commands
- Collaborative editing (multiple users editing same file)
- Full IDE feature parity on mobile
- Offline mode (cached files for viewing without connection)

## Dependencies

- VSCode Extension API for editor integration
- Mobile app distribution platforms (App Store, Google Play)
- Cloud infrastructure for relay server deployment
- Push notification services (APNs for iOS, FCM for Android)
