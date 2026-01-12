import { Command, CommandCategory, Message } from '@nzr-dev/shared';
import { WebSocketServerManager, ConnectedClient } from './websocket';
import { filesService, FileEntry, FileContent } from '../services/files';
import { editorService, EditorState } from '../services/editor';
import { terminalService, TerminalInfo } from '../services/terminal';
import { aiBridgeService, AIExtensionInfo, AIChatSession, AIMessage } from '../services/ai-bridge';
import { diagnosticsService, DiagnosticEntry, DiagnosticsChangeEvent } from '../services/diagnostics';
import { relayLite } from '../services/relay-lite';
import { Logger } from '../utils/logger';

const logger = new Logger('NZR Handlers');

/**
 * Command handler function type
 */
type CommandHandler = (
  client: ConnectedClient,
  command: Command,
  server: WebSocketServerManager
) => Promise<void>;

/**
 * Registry of command handlers
 */
const handlers: Map<string, CommandHandler> = new Map();

/**
 * Register a command handler
 */
function registerHandler(category: CommandCategory, action: string, handler: CommandHandler): void {
  const key = `${category}:${action}`;
  handlers.set(key, handler);
}

/**
 * Process a command
 */
export async function processCommand(
  client: ConnectedClient,
  command: Command,
  server: WebSocketServerManager
): Promise<void> {
  const key = `${command.category}:${command.action}`;
  const handler = handlers.get(key);

  if (!handler) {
    logger.warn(`No handler for command: ${key}`);
    server.sendError(client, 'UNKNOWN_COMMAND', `Unknown command: ${key}`, command.id);
    return;
  }

  try {
    await handler(client, command, server);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Handler error for ${key}`, error as Error);
    server.sendError(client, 'HANDLER_ERROR', message, command.id);
  }
}

// =============================================================================
// File Commands
// =============================================================================

/**
 * List files in a directory
 */
registerHandler('file', 'list', async (client, command, server) => {
  const path = (command.payload.path as string) || '';
  logger.debug(`Listing files in: ${path || '/'}`);

  const entries: FileEntry[] = await filesService.listFiles(path);
  server.sendResponse(client, command.id, { entries });
});

/**
 * Read file content
 */
registerHandler('file', 'read', async (client, command, server) => {
  const path = command.payload.path as string;
  const encoding = (command.payload.encoding as string) || 'utf-8';

  if (!path) {
    throw new Error('File path is required');
  }

  logger.debug(`Reading file: ${path}`);
  const content: FileContent = await filesService.readFile(path, encoding);
  server.sendResponse(client, command.id, content);
});

/**
 * Open file in editor
 */
registerHandler('file', 'open', async (client, command, server) => {
  const path = command.payload.path as string;
  const selection = command.payload.selection as {
    startLine: number;
    startColumn: number;
    endLine?: number;
    endColumn?: number;
  } | undefined;

  if (!path) {
    throw new Error('File path is required');
  }

  logger.debug(`Opening file: ${path}`);
  await filesService.openFile(path, { selection });
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Search files by pattern
 */
registerHandler('file', 'search', async (client, command, server) => {
  const pattern = command.payload.pattern as string;
  const maxResults = (command.payload.maxResults as number) || 100;

  if (!pattern) {
    throw new Error('Search pattern is required');
  }

  logger.debug(`Searching files: ${pattern}`);
  const entries: FileEntry[] = await filesService.searchFiles(pattern, maxResults);
  server.sendResponse(client, command.id, { entries });
});

/**
 * Get file stats
 */
registerHandler('file', 'stat', async (client, command, server) => {
  const path = command.payload.path as string;

  if (!path) {
    throw new Error('File path is required');
  }

  const stats = await filesService.getFileStats(path);
  server.sendResponse(client, command.id, stats);
});

/**
 * Write file content
 */
registerHandler('file', 'write', async (client, command, server) => {
  const path = command.payload.path as string;
  const content = command.payload.content as string;
  const createBackup = command.payload.createBackup as boolean | undefined;

  if (!path) {
    throw new Error('File path is required');
  }
  if (typeof content !== 'string') {
    throw new Error('Content is required');
  }

  await filesService.writeFile(path, content, { createBackup });
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Save active file
 */
registerHandler('file', 'save', async (client, command, server) => {
  const saved = await filesService.saveActiveFile();
  server.sendResponse(client, command.id, { success: saved });
});

// =============================================================================
// Editor Commands
// =============================================================================

/**
 * Get current editor state
 */
registerHandler('editor', 'getState', async (client, command, server) => {
  const state: EditorState = editorService.getState();
  server.sendResponse(client, command.id, state);
});

/**
 * Go to position in editor
 */
registerHandler('editor', 'goTo', async (client, command, server) => {
  const line = command.payload.line as number;
  const column = (command.payload.column as number) || 0;

  if (typeof line !== 'number') {
    throw new Error('Line number is required');
  }

  await editorService.goToPosition(line, column);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Set selection in editor
 */
registerHandler('editor', 'setSelection', async (client, command, server) => {
  const { startLine, startColumn, endLine, endColumn } = command.payload as {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };

  await editorService.setSelection(startLine, startColumn, endLine, endColumn);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Get selection text
 */
registerHandler('editor', 'getSelection', async (client, command, server) => {
  const text = editorService.getSelectionText();
  server.sendResponse(client, command.id, { text });
});

/**
 * Insert text at cursor
 */
registerHandler('editor', 'insertText', async (client, command, server) => {
  const text = command.payload.text as string;

  if (!text) {
    throw new Error('Text is required');
  }

  await editorService.insertText(text);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Replace selection with text
 */
registerHandler('editor', 'replaceSelection', async (client, command, server) => {
  const text = command.payload.text as string;

  if (typeof text !== 'string') {
    throw new Error('Text is required');
  }

  await editorService.replaceSelection(text);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Get line text
 */
registerHandler('editor', 'getLine', async (client, command, server) => {
  const line = command.payload.line as number;

  if (typeof line !== 'number') {
    throw new Error('Line number is required');
  }

  const text = editorService.getLineText(line);
  server.sendResponse(client, command.id, { text });
});

/**
 * Get visible text in editor
 */
registerHandler('editor', 'getVisibleText', async (client, command, server) => {
  const text = editorService.getVisibleText();
  server.sendResponse(client, command.id, { text });
});

// =============================================================================
// Workspace Commands
// =============================================================================

/**
 * Get workspace info
 */
registerHandler('workspace', 'getInfo', async (client, command, server) => {
  const vscode = await import('vscode');
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    server.sendResponse(client, command.id, { workspace: null });
    return;
  }

  const workspace = {
    name: folders[0].name,
    uri: folders[0].uri.toString(),
    folders: folders.map(f => ({
      name: f.name,
      uri: f.uri.toString(),
    })),
  };

  server.sendResponse(client, command.id, { workspace });
});

// =============================================================================
// Terminal Commands
// =============================================================================

/**
 * List all terminals
 */
registerHandler('terminal', 'list', async (client, command, server) => {
  const terminals: TerminalInfo[] = terminalService.listTerminals();
  server.sendResponse(client, command.id, { terminals });
});

/**
 * Create a new terminal
 */
registerHandler('terminal', 'create', async (client, command, server) => {
  const options = {
    name: command.payload.name as string | undefined,
    cwd: command.payload.cwd as string | undefined,
    env: command.payload.env as Record<string, string> | undefined,
    shellPath: command.payload.shellPath as string | undefined,
    shellArgs: command.payload.shellArgs as string[] | undefined,
  };

  const terminal = await terminalService.createTerminal(options);
  server.sendResponse(client, command.id, { terminal });
});

/**
 * Execute command in terminal
 */
registerHandler('terminal', 'execute', async (client, command, server) => {
  const terminalId = command.payload.terminalId as string | undefined;
  const cmd = command.payload.command as string;
  const show = command.payload.show as boolean | undefined;
  const clearBuffer = command.payload.clearBuffer as boolean | undefined;
  const captureOutput = command.payload.captureOutput as boolean | undefined;
  const cwd = command.payload.cwd as string | undefined;
  const timeout = command.payload.timeout as number | undefined;

  if (!cmd) {
    throw new Error('Command is required');
  }

  // If captureOutput is true, use child_process to execute and capture output
  if (captureOutput) {
    const result = await terminalService.executeWithOutput(cmd, { cwd, timeout });
    server.sendResponse(client, command.id, {
      terminalId: 'captured',
      executed: true,
      output: result.stdout || result.stderr,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      cwd: result.cwd,
    });
    return;
  }

  // Otherwise, execute in VSCode terminal (no output capture)
  const result = await terminalService.executeCommand(terminalId, cmd, {
    show,
    clearBuffer,
  });
  server.sendResponse(client, command.id, result);
});

/**
 * Send input to terminal
 */
registerHandler('terminal', 'sendInput', async (client, command, server) => {
  const terminalId = command.payload.terminalId as string;
  const input = command.payload.input as string;

  if (!terminalId) {
    throw new Error('Terminal ID is required');
  }
  if (!input) {
    throw new Error('Input is required');
  }

  await terminalService.sendInput(terminalId, input);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Send interrupt signal (Ctrl+C) to terminal
 */
registerHandler('terminal', 'interrupt', async (client, command, server) => {
  const terminalId = command.payload.terminalId as string;

  if (!terminalId) {
    throw new Error('Terminal ID is required');
  }

  await terminalService.sendInterrupt(terminalId);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Show terminal
 */
registerHandler('terminal', 'show', async (client, command, server) => {
  const terminalId = command.payload.terminalId as string;
  const preserveFocus = command.payload.preserveFocus as boolean | undefined;

  if (!terminalId) {
    throw new Error('Terminal ID is required');
  }

  await terminalService.showTerminal(terminalId, preserveFocus);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Dispose terminal
 */
registerHandler('terminal', 'dispose', async (client, command, server) => {
  const terminalId = command.payload.terminalId as string;

  if (!terminalId) {
    throw new Error('Terminal ID is required');
  }

  await terminalService.disposeTerminal(terminalId);
  server.sendResponse(client, command.id, { success: true });
});

/**
 * Set current working directory for captureOutput commands
 */
registerHandler('terminal', 'setCwd', async (client, command, server) => {
  const cwd = command.payload.cwd as string;

  if (!cwd) {
    throw new Error('Working directory path is required');
  }

  terminalService.setCwd(cwd);
  server.sendResponse(client, command.id, { success: true, cwd });
});

/**
 * Get current working directory
 */
registerHandler('terminal', 'getCwd', async (client, command, server) => {
  const cwd = terminalService.getCwd();
  server.sendResponse(client, command.id, { cwd });
});

/**
 * Execute command with streaming output
 */
registerHandler('terminal', 'executeStreaming', async (client, command, server) => {
  const cmd = command.payload.command as string;
  const cwd = command.payload.cwd as string | undefined;

  logger.info(`[STREAMING] Starting command: ${cmd}, cwd: ${cwd || 'default'}`);

  if (!cmd) {
    throw new Error('Command is required');
  }

  const { streamId } = terminalService.executeStreaming(cmd, { cwd });

  logger.info(`[STREAMING] Stream started with ID: ${streamId}`);

  // Response is sent immediately with streamId
  // Output will be sent via events
  server.sendResponse(client, command.id, {
    streamId,
    started: true,
    cwd: cwd || terminalService.getCwd(),
  });
});

/**
 * Kill a streaming process
 */
registerHandler('terminal', 'killStream', async (client, command, server) => {
  const streamId = command.payload.streamId as string;

  if (!streamId) {
    throw new Error('Stream ID is required');
  }

  const killed = terminalService.killStream(streamId);
  server.sendResponse(client, command.id, { success: killed });
});

/**
 * Get active streaming processes
 */
registerHandler('terminal', 'getActiveStreams', async (client, command, server) => {
  const streams = terminalService.getActiveStreams();
  server.sendResponse(client, command.id, { streams });
});

// =============================================================================
// AI Commands
// =============================================================================

/**
 * Get AI status and available extensions
 */
registerHandler('ai', 'getStatus', async (client, command, server) => {
  const status = aiBridgeService.getStatus();
  server.sendResponse(client, command.id, status);
});

/**
 * Get available AI extensions
 */
registerHandler('ai', 'getExtensions', async (client, command, server) => {
  const extensions: AIExtensionInfo[] = aiBridgeService.getAvailableExtensions();
  server.sendResponse(client, command.id, { extensions });
});

/**
 * Create a new AI chat session
 */
registerHandler('ai', 'createSession', async (client, command, server) => {
  const session: AIChatSession = aiBridgeService.createSession();
  server.sendResponse(client, command.id, { session });
});

/**
 * Get AI session
 */
registerHandler('ai', 'getSession', async (client, command, server) => {
  const sessionId = command.payload.sessionId as string;

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const session = aiBridgeService.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  server.sendResponse(client, command.id, { session });
});

/**
 * List all AI sessions
 */
registerHandler('ai', 'listSessions', async (client, command, server) => {
  const sessions: AIChatSession[] = aiBridgeService.listSessions();
  server.sendResponse(client, command.id, { sessions });
});

/**
 * Delete AI session
 */
registerHandler('ai', 'deleteSession', async (client, command, server) => {
  const sessionId = command.payload.sessionId as string;

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const deleted = aiBridgeService.deleteSession(sessionId);
  server.sendResponse(client, command.id, { success: deleted });
});

/**
 * Send message to AI
 */
registerHandler('ai', 'sendMessage', async (client, command, server) => {
  const sessionId = command.payload.sessionId as string;
  const message = command.payload.message as string;
  const includeContext = command.payload.includeContext as boolean | undefined;
  const selectedText = command.payload.selectedText as string | undefined;

  if (!sessionId) {
    throw new Error('Session ID is required');
  }
  if (!message) {
    throw new Error('Message is required');
  }

  const response: AIMessage = await aiBridgeService.sendMessage(sessionId, message, {
    includeContext,
    selectedText,
  });

  server.sendResponse(client, command.id, { message: response });
});

// =============================================================================
// Git/Source Control Commands
// =============================================================================

/**
 * Get git status (list of changed files)
 */
registerHandler('git', 'status', async (client, command, server) => {
  const { stdout, stderr, exitCode } = await terminalService.executeWithOutput('git status --porcelain', {});

  if (exitCode !== 0) {
    throw new Error(stderr || 'Failed to get git status');
  }

  // Parse porcelain output
  const files = stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const status = line.substring(0, 2);
      const path = line.substring(3);
      return {
        path,
        status,
        staged: status[0] !== ' ' && status[0] !== '?',
        modified: status.includes('M'),
        added: status.includes('A') || status.includes('?'),
        deleted: status.includes('D'),
        renamed: status.includes('R'),
        untracked: status === '??',
      };
    });

  server.sendResponse(client, command.id, { files });
});

/**
 * Get diff for a specific file
 */
registerHandler('git', 'diff', async (client, command, server) => {
  const filePath = command.payload.filePath as string;
  const staged = command.payload.staged as boolean;

  const stagedFlag = staged ? '--staged' : '';
  const pathArg = filePath ? `-- "${filePath}"` : '';
  const cmd = `git diff ${stagedFlag} ${pathArg}`.trim();

  const { stdout, stderr, exitCode } = await terminalService.executeWithOutput(cmd, {});

  if (exitCode !== 0 && stderr) {
    throw new Error(stderr);
  }

  server.sendResponse(client, command.id, { diff: stdout });
});

/**
 * Get file content from git (original/staged version)
 */
registerHandler('git', 'show', async (client, command, server) => {
  const filePath = command.payload.filePath as string;
  const ref = command.payload.ref as string || 'HEAD';

  if (!filePath) {
    throw new Error('File path is required');
  }

  const { stdout, stderr, exitCode } = await terminalService.executeWithOutput(
    `git show ${ref}:"${filePath}"`,
    {}
  );

  if (exitCode !== 0) {
    // File might be new/untracked
    server.sendResponse(client, command.id, { content: '', isNew: true });
    return;
  }

  server.sendResponse(client, command.id, { content: stdout, isNew: false });
});

/**
 * Stage a file
 */
registerHandler('git', 'stage', async (client, command, server) => {
  const filePath = command.payload.filePath as string;

  if (!filePath) {
    throw new Error('File path is required');
  }

  const { stderr, exitCode } = await terminalService.executeWithOutput(
    `git add "${filePath}"`,
    {}
  );

  if (exitCode !== 0) {
    throw new Error(stderr || 'Failed to stage file');
  }

  server.sendResponse(client, command.id, { success: true });
});

/**
 * Unstage a file
 */
registerHandler('git', 'unstage', async (client, command, server) => {
  const filePath = command.payload.filePath as string;

  if (!filePath) {
    throw new Error('File path is required');
  }

  const { stderr, exitCode } = await terminalService.executeWithOutput(
    `git reset HEAD "${filePath}"`,
    {}
  );

  if (exitCode !== 0) {
    throw new Error(stderr || 'Failed to unstage file');
  }

  server.sendResponse(client, command.id, { success: true });
});

/**
 * Discard changes in a file
 */
registerHandler('git', 'discard', async (client, command, server) => {
  const filePath = command.payload.filePath as string;

  if (!filePath) {
    throw new Error('File path is required');
  }

  const { stderr, exitCode } = await terminalService.executeWithOutput(
    `git checkout -- "${filePath}"`,
    {}
  );

  if (exitCode !== 0) {
    throw new Error(stderr || 'Failed to discard changes');
  }

  server.sendResponse(client, command.id, { success: true });
});

/**
 * Get current branch name
 */
registerHandler('git', 'branch', async (client, command, server) => {
  const { stdout, stderr, exitCode } = await terminalService.executeWithOutput(
    'git branch --show-current',
    {}
  );

  if (exitCode !== 0) {
    throw new Error(stderr || 'Failed to get branch');
  }

  server.sendResponse(client, command.id, { branch: stdout.trim() });
});

// =============================================================================
// Diagnostics Commands
// =============================================================================

/**
 * Get all diagnostics
 */
registerHandler('diagnostics', 'getAll', async (client, command, server) => {
  const diagnostics: DiagnosticEntry[] = diagnosticsService.getAllDiagnostics();
  server.sendResponse(client, command.id, { diagnostics });
});

/**
 * Get diagnostics for a specific file
 */
registerHandler('diagnostics', 'getFile', async (client, command, server) => {
  const filePath = command.payload.filePath as string;

  if (!filePath) {
    throw new Error('File path is required');
  }

  const diagnostics: DiagnosticEntry[] = diagnosticsService.getFileDiagnostics(filePath);
  server.sendResponse(client, command.id, { diagnostics });
});

/**
 * Get diagnostics summary
 */
registerHandler('diagnostics', 'getSummary', async (client, command, server) => {
  const summary = diagnosticsService.getSummary();
  const fileSummaries = diagnosticsService.getFileSummaries();
  server.sendResponse(client, command.id, { summary, fileSummaries });
});

// =============================================================================
// Initialize Handler Registration
// =============================================================================

/**
 * Helper to broadcast events to both local WebSocket clients and relay lite server
 */
function broadcastEvent(server: WebSocketServerManager, eventType: string, data: unknown): void {
  const event = {
    type: 'event',
    id: `evt_${Date.now()}`,
    timestamp: Date.now(),
    eventType,
    data,
  } as Message;

  const relayDeviceCount = relayLite.getConnectedDeviceCount();
  logger.info(`[BROADCAST] Event: ${eventType}, local clients: ${server.getClientCount()}, relay devices: ${relayDeviceCount}`);

  // Broadcast to local WebSocket clients
  server.broadcast(event);

  // Also broadcast to relay lite connected devices (via Socket.IO)
  const io = relayLite.getIO();
  if (io && relayDeviceCount > 0) {
    logger.debug(`[BROADCAST] Sending to relay lite: ${eventType}`);
    io.of('/device').emit('event', event);
  }
}

export function initializeHandlers(server: WebSocketServerManager): void {
  server.on('command', (client: ConnectedClient, command: Command) => {
    processCommand(client, command, server);
  });

  // Subscribe to editor state changes and broadcast
  editorService.on('stateChanged', (state: EditorState) => {
    broadcastEvent(server, 'editor:stateChanged', state);
  });

  // Initialize terminal service
  terminalService.initialize();

  // Subscribe to terminal events and broadcast
  terminalService.on('terminalClosed', (data: { terminalId: string }) => {
    broadcastEvent(server, 'terminal:closed', data);
  });

  terminalService.on('activeTerminalChanged', (data: { terminalId: string }) => {
    broadcastEvent(server, 'terminal:activeChanged', data);
  });

  // Subscribe to terminal streaming events and broadcast
  terminalService.on('output', (data: { streamId: string; type: string; data: string }) => {
    logger.info(`[TERMINAL OUTPUT] Received output event: streamId=${data.streamId}, type=${data.type}, length=${data.data?.length}`);
    broadcastEvent(server, 'terminal:output', data);
  });
  logger.info('[HANDLERS] Terminal output event listener registered');

  terminalService.on('streamStart', (data: { streamId: string; command: string; cwd: string }) => {
    broadcastEvent(server, 'terminal:streamStart', data);
  });

  terminalService.on('streamEnd', (data: { streamId: string; exitCode: number; output: string }) => {
    broadcastEvent(server, 'terminal:streamEnd', data);
  });

  // Subscribe to AI events and broadcast
  aiBridgeService.on('message', (data: { sessionId: string; message: AIMessage }) => {
    broadcastEvent(server, 'ai:message', data);
  });

  aiBridgeService.on('streamStart', (data: { sessionId: string; messageId: string }) => {
    broadcastEvent(server, 'ai:streamStart', data);
  });

  aiBridgeService.on('streamEnd', (data: { sessionId: string; messageId: string }) => {
    broadcastEvent(server, 'ai:streamEnd', data);
  });

  aiBridgeService.on('streamChunk', (data: { sessionId: string; messageId: string; chunk: string; content: string }) => {
    broadcastEvent(server, 'ai:streamChunk', data);
  });

  // Initialize diagnostics service
  diagnosticsService.initialize();

  // Subscribe to diagnostics events and broadcast
  diagnosticsService.on('diagnosticsChanged', (event: DiagnosticsChangeEvent) => {
    broadcastEvent(server, 'diagnostics:changed', event);
  });

  logger.info('Command handlers initialized');
}
