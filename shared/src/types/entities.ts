/**
 * Entity Types
 * Core data models for the NZR Dev Plugin system
 */

/** Device types in the system */
export type DeviceType = 'vscode' | 'mobile';

/** Device entity - represents VSCode instance or mobile client */
export interface Device {
  /** Unique device identifier (UUID) */
  id: string;
  /** Device type */
  type: DeviceType;
  /** User-friendly device name */
  name: string;
  /** OS/platform (e.g., "macOS", "iOS 17", "Android 14") */
  platform: string;
  /** Application/extension version */
  appVersion: string;
  /** Push notification token (mobile only) */
  pushToken?: string;
  /** First registration timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastSeenAt: Date;
}

/** Permission types for session access */
export type Permission =
  | 'files:read'
  | 'files:write'
  | 'editor:read'
  | 'editor:write'
  | 'terminal:read'
  | 'terminal:write'
  | 'ai:access';

/** Session entity - authenticated user session */
export interface Session {
  /** Unique session identifier (UUID) */
  id: string;
  /** Reference to Device */
  deviceId: string;
  /** Reference to Workspace (VSCode only) */
  workspaceId?: string;
  /** JWT access token */
  accessToken: string;
  /** JWT refresh token */
  refreshToken: string;
  /** List of granted permissions */
  permissions: Permission[];
  /** Session creation timestamp */
  createdAt: Date;
  /** Access token expiration */
  expiresAt: Date;
  /** Refresh token expiration */
  refreshExpiresAt: Date;
  /** Revocation timestamp (null if active) */
  revokedAt?: Date;
}

/** Connection types */
export type ConnectionType = 'local' | 'relay';

/** Connection status values */
export type ConnectionStatus =
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/** Connection entity - active link between devices */
export interface Connection {
  /** Unique connection identifier (UUID) */
  id: string;
  /** VSCode device reference */
  vscodeDeviceId: string;
  /** Mobile device reference */
  mobileDeviceId: string;
  /** Connection type */
  type: ConnectionType;
  /** Connection status */
  status: ConnectionStatus;
  /** Associated session ID */
  sessionId: string;
  /** IP:port for local connections */
  localAddress?: string;
  /** Relay server room ID */
  relayRoomId?: string;
  /** Connection start timestamp */
  establishedAt: Date;
  /** Last heartbeat timestamp */
  lastPingAt: Date;
  /** Measured round-trip latency in ms */
  latencyMs?: number;
}

/** Workspace entity - VSCode project being controlled */
export interface Workspace {
  /** Unique workspace identifier (UUID) */
  id: string;
  /** VSCode device hosting this workspace */
  deviceId: string;
  /** Workspace/folder name */
  name: string;
  /** Absolute filesystem path */
  rootPath: string;
  /** Current git branch if applicable */
  gitBranch?: string;
  /** Currently focused file path */
  activeFile?: string;
  /** List of open editor tabs */
  openFiles: string[];
  /** First opened timestamp */
  createdAt: Date;
}

/** Pairing token entity - temporary token for device pairing */
export interface PairingToken {
  /** Token identifier (UUID) */
  id: string;
  /** Workspace being paired */
  workspaceId: string;
  /** SHA-256 hash of token */
  tokenHash: string;
  /** Alternative PIN code (6 digits) */
  pin?: string;
  /** Failed PIN attempts */
  pinAttempts: number;
  /** Token generation time */
  createdAt: Date;
  /** Token expiration (5 min default) */
  expiresAt: Date;
  /** When token was consumed */
  usedAt?: Date;
  /** Device that used the token */
  usedByDeviceId?: string;
}

/** Command status values */
export type CommandStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'timeout';

/** Command type categories */
export type CommandType = 'file' | 'editor' | 'terminal' | 'ai' | 'system';

/** Command entity - request from mobile to VSCode */
export interface CommandRecord {
  /** Unique command identifier (UUID) */
  id: string;
  /** Connection reference */
  connectionId: string;
  /** Command category */
  type: CommandType;
  /** Specific action name */
  action: string;
  /** Action-specific data */
  payload: Record<string, unknown>;
  /** When command was sent */
  sentAt: Date;
  /** When VSCode received it */
  receivedAt?: Date;
  /** When processing finished */
  completedAt?: Date;
  /** Processing status */
  status: CommandStatus;
  /** Error message if failed */
  error?: string;
}

/** Event type categories */
export type EventType =
  | 'state'
  | 'notification'
  | 'ai-response'
  | 'terminal-output'
  | 'file-change';

/** Event entity - notification from VSCode to mobile */
export interface EventRecord {
  /** Unique event identifier (UUID) */
  id: string;
  /** Connection reference */
  connectionId: string;
  /** Event category */
  type: EventType;
  /** Event-specific payload */
  data: Record<string, unknown>;
  /** When event occurred */
  timestamp: Date;
}
