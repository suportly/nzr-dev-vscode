# Data Model: NZR Dev Plugin - VSCode Remote Control

**Date**: 2026-01-12
**Branch**: `001-vscode-remote-control`

## Overview

This document defines the data entities, their attributes, relationships, and validation rules for the VSCode Remote Control system.

## Entities

### Device

Represents either a VSCode instance or a mobile client.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique device identifier |
| type | Enum | Yes | `vscode` or `mobile` |
| name | String(100) | Yes | User-friendly device name |
| platform | String(50) | Yes | OS/platform (e.g., "macOS", "iOS 17", "Android 14") |
| appVersion | String(20) | Yes | Application/extension version |
| pushToken | String(255) | No | Push notification token (mobile only) |
| createdAt | DateTime | Yes | First registration timestamp |
| lastSeenAt | DateTime | Yes | Last activity timestamp |

**Validation Rules**:
- `name`: 1-100 characters, alphanumeric with spaces/hyphens
- `type`: Must be one of defined enum values
- `pushToken`: Valid Expo push token format when present

**Relationships**:
- Device → many Sessions
- Device → many Connections (as either endpoint)

---

### Session

Represents an authenticated user session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique session identifier |
| deviceId | UUID | Yes | Reference to Device |
| workspaceId | UUID | No | Reference to Workspace (VSCode only) |
| accessToken | String(500) | Yes | JWT access token |
| refreshToken | String(500) | Yes | JWT refresh token |
| permissions | String[] | Yes | List of granted permissions |
| createdAt | DateTime | Yes | Session creation timestamp |
| expiresAt | DateTime | Yes | Access token expiration |
| refreshExpiresAt | DateTime | Yes | Refresh token expiration |
| revokedAt | DateTime | No | Revocation timestamp (null if active) |

**Validation Rules**:
- `accessToken`: Valid JWT format
- `permissions`: Subset of defined permission set
- `expiresAt`: Must be after `createdAt`
- `refreshExpiresAt`: Must be after `expiresAt`

**State Transitions**:
```
[Created] → [Active] → [Expired] → [Deleted]
                    ↘ [Revoked] → [Deleted]
```

**Permissions Enum**:
- `files:read` - List and read files
- `files:write` - Create and edit files
- `editor:read` - Get editor state
- `editor:write` - Modify editor content
- `terminal:read` - View terminal output
- `terminal:write` - Execute commands
- `ai:access` - Interact with AI assistants

---

### Connection

Represents an active link between devices.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique connection identifier |
| vscodeDeviceId | UUID | Yes | VSCode device reference |
| mobileDeviceId | UUID | Yes | Mobile device reference |
| type | Enum | Yes | `local` or `relay` |
| status | Enum | Yes | Connection status |
| sessionId | UUID | Yes | Associated session |
| localAddress | String(45) | No | IP:port for local connections |
| relayRoomId | String(100) | No | Relay server room ID |
| establishedAt | DateTime | Yes | Connection start timestamp |
| lastPingAt | DateTime | Yes | Last heartbeat timestamp |
| latencyMs | Integer | No | Measured round-trip latency |

**Validation Rules**:
- `type` = `local` requires `localAddress`
- `type` = `relay` requires `relayRoomId`
- `latencyMs`: 0-30000 range

**Status Enum**:
- `connecting` - Handshake in progress
- `active` - Fully connected
- `reconnecting` - Attempting to restore
- `disconnected` - Graceful disconnect
- `error` - Connection failed

---

### Workspace

Represents the VSCode project being controlled.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique workspace identifier |
| deviceId | UUID | Yes | VSCode device hosting this workspace |
| name | String(100) | Yes | Workspace/folder name |
| rootPath | String(500) | Yes | Absolute filesystem path |
| gitBranch | String(100) | No | Current git branch if applicable |
| activeFile | String(500) | No | Currently focused file path |
| openFiles | String[] | Yes | List of open editor tabs |
| createdAt | DateTime | Yes | First opened timestamp |

**Validation Rules**:
- `rootPath`: Valid filesystem path format
- `openFiles`: Maximum 50 entries

---

### Command

A request from mobile to VSCode.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique command identifier |
| connectionId | UUID | Yes | Connection reference |
| type | Enum | Yes | Command category |
| action | String(50) | Yes | Specific action name |
| payload | JSON | Yes | Action-specific data |
| sentAt | DateTime | Yes | When command was sent |
| receivedAt | DateTime | No | When VSCode received it |
| completedAt | DateTime | No | When processing finished |
| status | Enum | Yes | Processing status |
| error | String(500) | No | Error message if failed |

**Type Enum**:
- `file` - File operations (list, open, read, write)
- `editor` - Editor operations (getContent, setCursor, select)
- `terminal` - Terminal operations (execute, sendInput, resize)
- `ai` - AI operations (send, getHistory)
- `system` - System operations (ping, getState, disconnect)

**Status Enum**:
- `pending` - Queued for processing
- `processing` - Being handled
- `completed` - Successfully finished
- `failed` - Error occurred
- `timeout` - No response within limit

---

### Event

A notification from VSCode to mobile.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique event identifier |
| connectionId | UUID | Yes | Connection reference |
| type | Enum | Yes | Event category |
| data | JSON | Yes | Event-specific payload |
| timestamp | DateTime | Yes | When event occurred |

**Type Enum**:
- `state` - Editor/workspace state change
- `notification` - Diagnostic or system notification
- `ai-response` - AI assistant message
- `terminal-output` - Terminal data stream
- `file-change` - File system change

---

### PairingToken

Temporary token for device pairing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Token identifier |
| workspaceId | UUID | Yes | Workspace being paired |
| tokenHash | String(64) | Yes | SHA-256 hash of token |
| pin | String(6) | No | Alternative PIN code |
| pinAttempts | Integer | Yes | Failed PIN attempts |
| createdAt | DateTime | Yes | Token generation time |
| expiresAt | DateTime | Yes | Token expiration (5 min) |
| usedAt | DateTime | No | When token was consumed |
| usedByDeviceId | UUID | No | Device that used the token |

**Validation Rules**:
- `pin`: Exactly 6 digits when present
- `pinAttempts`: Max 5, then lockout
- `expiresAt`: 5 minutes after `createdAt`

---

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐
│   Device    │───────│   Session   │
│  (vscode)   │1    n │             │
└─────────────┘       └─────────────┘
       │                     │
       │1                   1│
       │              ┌──────┴──────┐
       │              │             │
┌──────┴──────┐       │  Connection │
│  Workspace  │       │             │
│             │       └──────┬──────┘
└─────────────┘              │n
                             │
                      ┌──────┴──────┐
                      │             │
              ┌───────┤   Command   │
              │       │             │
              │       └─────────────┘
              │
       ┌──────┴──────┐
       │    Event    │
       │             │
       └─────────────┘

┌─────────────┐
│PairingToken │ (temporary, consumed on use)
└─────────────┘
```

## Storage Strategy

| Entity | Storage | TTL/Retention |
|--------|---------|---------------|
| Device | Redis + Relay DB | Permanent until deleted |
| Session | Redis | 7 days (refresh token lifetime) |
| Connection | Redis | Until disconnected |
| Workspace | Memory (extension) | Session lifetime |
| Command | Memory (queue) | Until processed + 5 min |
| Event | Memory (buffer) | Last 100 events |
| PairingToken | Redis | 5 minutes |

## Indexes

**Redis Keys**:
- `device:{id}` - Device data
- `session:{id}` - Session data
- `session:device:{deviceId}` - Sessions by device
- `connection:{id}` - Connection data
- `pairing:{tokenHash}` - Pairing token lookup
- `room:{workspaceId}` - Active connections per workspace
