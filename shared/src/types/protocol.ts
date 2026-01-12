/**
 * WebSocket Protocol Types
 * Defines message formats for communication between mobile app and VSCode extension
 */

/** Base message interface for all protocol messages */
export interface Message {
  /** UUID v4 identifier */
  id: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Message type */
  type: 'command' | 'event' | 'response' | 'error';
}

/** Command categories for mobile → VSCode requests */
export type CommandCategory = 'file' | 'editor' | 'terminal' | 'ai' | 'system' | 'workspace' | 'diagnostics' | 'git';

/** Command message from mobile to VSCode */
export interface Command extends Message {
  type: 'command';
  /** Command category */
  category: CommandCategory;
  /** Specific action within category */
  action: string;
  /** Action-specific payload */
  payload: Record<string, unknown>;
}

/** Event categories for VSCode → mobile notifications */
export type EventCategory = 'state' | 'notification' | 'ai-response' | 'terminal-output' | 'file-change';

/** Event message from VSCode to mobile */
export interface Event extends Message {
  type: 'event';
  /** Event category */
  category: EventCategory;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/** Success response from VSCode to mobile */
export interface Response extends Message {
  type: 'response';
  /** Reference to original command ID */
  commandId: string;
  /** Success indicator */
  success: boolean;
  /** Response data */
  data?: unknown;
}

/** Error codes for failed operations */
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_COMMAND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'TERMINAL_NOT_FOUND';

/** Error details structure */
export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Error response from VSCode to mobile */
export interface ErrorResponse extends Message {
  type: 'error';
  /** Reference to original command ID */
  commandId: string;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/** File entry in directory listing */
export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

/** Cursor/position in editor */
export interface Position {
  line: number;
  column: number;
}

/** Selection range in editor */
export interface Selection {
  start: Position;
  end: Position;
}

/** Editor state information */
export interface EditorState {
  activeFile: string | null;
  cursor: Position | null;
  selection: Selection | null;
  openFiles: string[];
}

/** Terminal session information */
export interface TerminalInfo {
  id: string;
  name: string;
  active: boolean;
}

/** Diagnostic severity levels */
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/** Single diagnostic entry */
export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
}

/** Union type for all protocol messages */
export type ProtocolMessage = Command | Event | Response | ErrorResponse;
