# WebSocket Protocol Contract

**Version**: 1.0.0
**Date**: 2026-01-12

## Overview

This document defines the WebSocket message protocol for communication between the mobile app and VSCode extension (both direct local connections and relay-proxied connections).

## Connection

### Local Connection
```
ws://[local-ip]:[port]/ws?token=[jwt]
```

### Relay Connection (via Socket.IO)
```
wss://relay.nzr.dev/socket.io/?token=[jwt]
Namespace: /device
Room: workspace-{workspaceId}
```

## Message Format

All messages are JSON objects with the following base structure:

```typescript
interface Message {
  id: string;          // UUID v4
  timestamp: number;   // Unix timestamp (ms)
  type: 'command' | 'event' | 'response' | 'error';
}
```

## Commands (Mobile → VSCode)

### Base Command Structure

```typescript
interface Command extends Message {
  type: 'command';
  category: 'file' | 'editor' | 'terminal' | 'ai' | 'system';
  action: string;
  payload: Record<string, any>;
}
```

### File Commands

#### List Files
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "file",
  "action": "list",
  "payload": {
    "path": "/src",
    "recursive": false,
    "includeHidden": false
  }
}
```

#### Read File
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "file",
  "action": "read",
  "payload": {
    "path": "/src/app.ts",
    "encoding": "utf-8",
    "maxLines": 5000
  }
}
```

#### Write File
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "file",
  "action": "write",
  "payload": {
    "path": "/src/app.ts",
    "content": "// file content",
    "createIfMissing": false
  }
}
```

#### Open File in Editor
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "file",
  "action": "open",
  "payload": {
    "path": "/src/app.ts",
    "preview": true,
    "viewColumn": 1
  }
}
```

### Editor Commands

#### Get Editor State
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "editor",
  "action": "getState",
  "payload": {}
}
```

#### Get Content
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "editor",
  "action": "getContent",
  "payload": {
    "includeSelection": true
  }
}
```

#### Set Cursor Position
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "editor",
  "action": "setCursor",
  "payload": {
    "line": 42,
    "column": 10
  }
}
```

#### Insert Text
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "editor",
  "action": "insert",
  "payload": {
    "text": "// inserted text",
    "position": { "line": 10, "column": 0 }
  }
}
```

### Terminal Commands

#### List Terminals
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "terminal",
  "action": "list",
  "payload": {}
}
```

#### Create Terminal
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "terminal",
  "action": "create",
  "payload": {
    "name": "Build",
    "cwd": "/project"
  }
}
```

#### Execute Command
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "terminal",
  "action": "execute",
  "payload": {
    "terminalId": "term-uuid",
    "command": "npm test"
  }
}
```

#### Send Input
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "terminal",
  "action": "sendInput",
  "payload": {
    "terminalId": "term-uuid",
    "data": "\u0003"
  }
}
```

### AI Commands

#### Send Message
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "ai",
  "action": "send",
  "payload": {
    "message": "Explain this function",
    "context": {
      "file": "/src/utils.ts",
      "selection": "lines 10-25"
    }
  }
}
```

#### Get AI Status
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "ai",
  "action": "getStatus",
  "payload": {}
}
```

### System Commands

#### Ping
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "system",
  "action": "ping",
  "payload": {}
}
```

#### Get Workspace State
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "system",
  "action": "getWorkspaceState",
  "payload": {}
}
```

#### Disconnect
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "system",
  "action": "disconnect",
  "payload": {
    "reason": "user_initiated"
  }
}
```

---

## Responses (VSCode → Mobile)

### Success Response

```typescript
interface Response extends Message {
  type: 'response';
  commandId: string;    // Reference to original command
  success: true;
  data: Record<string, any>;
}
```

### Error Response

```typescript
interface ErrorResponse extends Message {
  type: 'error';
  commandId: string;
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}
```

### Response Examples

#### File List Response
```json
{
  "id": "uuid",
  "timestamp": 1704931200100,
  "type": "response",
  "commandId": "original-command-uuid",
  "success": true,
  "data": {
    "path": "/src",
    "entries": [
      { "name": "app.ts", "type": "file", "size": 1234 },
      { "name": "utils", "type": "directory" }
    ]
  }
}
```

#### Editor State Response
```json
{
  "id": "uuid",
  "timestamp": 1704931200100,
  "type": "response",
  "commandId": "original-command-uuid",
  "success": true,
  "data": {
    "activeFile": "/src/app.ts",
    "cursor": { "line": 42, "column": 10 },
    "selection": {
      "start": { "line": 40, "column": 0 },
      "end": { "line": 45, "column": 20 }
    },
    "openFiles": ["/src/app.ts", "/src/utils.ts"]
  }
}
```

---

## Events (VSCode → Mobile)

### Base Event Structure

```typescript
interface Event extends Message {
  type: 'event';
  category: 'state' | 'notification' | 'ai-response' | 'terminal-output' | 'file-change';
  data: Record<string, any>;
}
```

### State Events

#### Editor State Changed
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "event",
  "category": "state",
  "data": {
    "change": "activeEditor",
    "activeFile": "/src/app.ts",
    "cursor": { "line": 10, "column": 5 }
  }
}
```

### Notification Events

#### Diagnostic Update
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "event",
  "category": "notification",
  "data": {
    "level": "error",
    "source": "typescript",
    "message": "3 errors found",
    "diagnostics": [
      {
        "file": "/src/app.ts",
        "line": 15,
        "message": "Type error: ...",
        "severity": "error"
      }
    ]
  }
}
```

### AI Response Events

#### Streaming Response
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "event",
  "category": "ai-response",
  "data": {
    "requestId": "original-ai-command-uuid",
    "streaming": true,
    "chunk": "The function calculates...",
    "done": false
  }
}
```

### Terminal Output Events

#### Output Data
```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "event",
  "category": "terminal-output",
  "data": {
    "terminalId": "term-uuid",
    "output": "PASS  src/app.test.ts\n",
    "stream": "stdout"
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Missing or invalid authentication |
| `AUTH_EXPIRED` | Token has expired |
| `PERMISSION_DENIED` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `INVALID_COMMAND` | Malformed command |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
| `TIMEOUT` | Operation timed out |
| `AI_UNAVAILABLE` | No AI extension available |
| `TERMINAL_NOT_FOUND` | Terminal session not found |

---

## Heartbeat

Clients must send a ping every 30 seconds to maintain connection:

```json
{
  "id": "uuid",
  "timestamp": 1704931200000,
  "type": "command",
  "category": "system",
  "action": "ping",
  "payload": {}
}
```

Server responds with:

```json
{
  "id": "uuid",
  "timestamp": 1704931200050,
  "type": "response",
  "commandId": "ping-uuid",
  "success": true,
  "data": { "pong": true, "serverTime": 1704931200050 }
}
```

Connections without heartbeat for 90 seconds are terminated.
