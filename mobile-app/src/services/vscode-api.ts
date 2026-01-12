import { socketService } from './socket';

/**
 * File entry from VSCode
 */
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  extension?: string;
}

/**
 * File content from VSCode
 */
export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
  language?: string;
}

/**
 * Editor cursor position
 */
export interface CursorPosition {
  line: number;
  column: number;
}

/**
 * Editor selection range
 */
export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
  text: string;
}

/**
 * Editor state from VSCode
 */
export interface EditorState {
  isActive: boolean;
  filePath: string | null;
  fileName: string | null;
  language: string | null;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
  isDirty: boolean;
  lineCount: number;
  visibleRange: {
    start: number;
    end: number;
  } | null;
}

/**
 * Workspace info from VSCode
 */
export interface WorkspaceInfo {
  name: string;
  uri: string;
  folders: Array<{
    name: string;
    uri: string;
  }>;
}

/**
 * VSCode API client for mobile app
 */
class VSCodeAPI {
  // =============================================================================
  // File Commands
  // =============================================================================

  /**
   * List files in a directory
   */
  async listFiles(path: string = ''): Promise<FileEntry[]> {
    const response = await socketService.sendCommandUnified<{ entries: FileEntry[] }>(
      'file',
      'list',
      { path }
    );
    return response.entries;
  }

  /**
   * Read file content
   */
  async readFile(path: string, encoding: string = 'utf-8'): Promise<FileContent> {
    return socketService.sendCommandUnified<FileContent>('file', 'read', {
      path,
      encoding,
    });
  }

  /**
   * Open file in VSCode editor
   */
  async openFile(
    path: string,
    options?: {
      startLine?: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
    }
  ): Promise<void> {
    const selection = options
      ? {
          startLine: options.startLine ?? 0,
          startColumn: options.startColumn ?? 0,
          endLine: options.endLine,
          endColumn: options.endColumn,
        }
      : undefined;

    await socketService.sendCommandUnified('file', 'open', {
      path,
      selection,
    });
  }

  /**
   * Search files by pattern
   */
  async searchFiles(pattern: string, maxResults: number = 100): Promise<FileEntry[]> {
    const response = await socketService.sendCommandUnified<{ entries: FileEntry[] }>(
      'file',
      'search',
      { pattern, maxResults }
    );
    return response.entries;
  }

  /**
   * Get file stats
   */
  async getFileStats(path: string): Promise<{
    size: number;
    created: number;
    modified: number;
    type: 'file' | 'directory';
  }> {
    return socketService.sendCommandUnified('file', 'stat', { path });
  }

  /**
   * Write file content
   */
  async writeFile(
    path: string,
    content: string,
    options?: { createBackup?: boolean }
  ): Promise<void> {
    await socketService.sendCommandUnified('file', 'write', {
      path,
      content,
      createBackup: options?.createBackup,
    });
  }

  /**
   * Save active file
   */
  async saveActiveFile(): Promise<boolean> {
    const response = await socketService.sendCommandUnified<{ success: boolean }>(
      'file',
      'save',
      {}
    );
    return response.success;
  }

  // =============================================================================
  // Editor Commands
  // =============================================================================

  /**
   * Get current editor state
   */
  async getEditorState(): Promise<EditorState> {
    return socketService.sendCommandUnified<EditorState>('editor', 'getState', {});
  }

  /**
   * Go to position in editor
   */
  async goToPosition(line: number, column: number = 0): Promise<void> {
    await socketService.sendCommandUnified('editor', 'goTo', { line, column });
  }

  /**
   * Set selection in editor
   */
  async setSelection(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): Promise<void> {
    await socketService.sendCommandUnified('editor', 'setSelection', {
      startLine,
      startColumn,
      endLine,
      endColumn,
    });
  }

  /**
   * Get selected text from editor
   */
  async getSelection(): Promise<string | null> {
    const response = await socketService.sendCommandUnified<{ text: string | null }>(
      'editor',
      'getSelection',
      {}
    );
    return response.text;
  }

  /**
   * Insert text at cursor position
   */
  async insertText(text: string): Promise<void> {
    await socketService.sendCommandUnified('editor', 'insertText', { text });
  }

  /**
   * Replace selection with text
   */
  async replaceSelection(text: string): Promise<void> {
    await socketService.sendCommandUnified('editor', 'replaceSelection', { text });
  }

  /**
   * Get text at line
   */
  async getLineText(line: number): Promise<string | null> {
    const response = await socketService.sendCommandUnified<{ text: string | null }>(
      'editor',
      'getLine',
      { line }
    );
    return response.text;
  }

  /**
   * Get visible text in editor
   */
  async getVisibleText(): Promise<string | null> {
    const response = await socketService.sendCommandUnified<{ text: string | null }>(
      'editor',
      'getVisibleText',
      {}
    );
    return response.text;
  }

  // =============================================================================
  // Workspace Commands
  // =============================================================================

  /**
   * Get workspace info
   */
  async getWorkspaceInfo(): Promise<WorkspaceInfo | null> {
    const response = await socketService.sendCommandUnified<{ workspace: WorkspaceInfo | null }>(
      'workspace',
      'getInfo',
      {}
    );
    return response.workspace;
  }

  // =============================================================================
  // Terminal Commands
  // =============================================================================

  /**
   * List all terminals
   */
  async listTerminals(): Promise<TerminalInfo[]> {
    const response = await socketService.sendCommandUnified<{ terminals: TerminalInfo[] }>(
      'terminal',
      'list',
      {}
    );
    return response.terminals;
  }

  /**
   * Create a new terminal
   */
  async createTerminal(options: CreateTerminalOptions = {}): Promise<TerminalInfo> {
    const response = await socketService.sendCommandUnified<{ terminal: TerminalInfo }>(
      'terminal',
      'create',
      options
    );
    return response.terminal;
  }

  /**
   * Execute command in terminal
   */
  async executeCommand(
    command: string,
    options: {
      terminalId?: string;
      show?: boolean;
      clearBuffer?: boolean;
      captureOutput?: boolean;
      cwd?: string;
      timeout?: number;
    } = {}
  ): Promise<ExecuteCommandResult> {
    return socketService.sendCommandUnified('terminal', 'execute', {
      terminalId: options.terminalId,
      command,
      show: options.show,
      clearBuffer: options.clearBuffer,
      captureOutput: options.captureOutput,
      cwd: options.cwd,
      timeout: options.timeout,
    });
  }

  /**
   * Send input to terminal
   */
  async sendTerminalInput(terminalId: string, input: string): Promise<void> {
    await socketService.sendCommandUnified('terminal', 'sendInput', {
      terminalId,
      input,
    });
  }

  /**
   * Send interrupt signal (Ctrl+C) to terminal
   */
  async interruptTerminal(terminalId: string): Promise<void> {
    await socketService.sendCommandUnified('terminal', 'interrupt', {
      terminalId,
    });
  }

  /**
   * Show terminal
   */
  async showTerminal(terminalId: string, preserveFocus?: boolean): Promise<void> {
    await socketService.sendCommandUnified('terminal', 'show', {
      terminalId,
      preserveFocus,
    });
  }

  /**
   * Dispose terminal
   */
  async disposeTerminal(terminalId: string): Promise<void> {
    await socketService.sendCommandUnified('terminal', 'dispose', {
      terminalId,
    });
  }

  /**
   * Set current working directory for captureOutput commands
   */
  async setCwd(cwd: string): Promise<{ success: boolean; cwd: string }> {
    return socketService.sendCommandUnified('terminal', 'setCwd', { cwd });
  }

  /**
   * Get current working directory
   */
  async getCwd(): Promise<string> {
    const response = await socketService.sendCommandUnified<{ cwd: string }>('terminal', 'getCwd', {});
    return response.cwd;
  }

  /**
   * Execute command with streaming output
   * Returns streamId immediately, output comes via events
   */
  async executeStreaming(
    command: string,
    options: { cwd?: string } = {}
  ): Promise<{ streamId: string; started: boolean; cwd: string }> {
    return socketService.sendCommandUnified('terminal', 'executeStreaming', {
      command,
      cwd: options.cwd,
    });
  }

  /**
   * Kill a streaming process
   */
  async killStream(streamId: string): Promise<{ success: boolean }> {
    return socketService.sendCommandUnified('terminal', 'killStream', { streamId });
  }

  /**
   * Get active streaming processes
   */
  async getActiveStreams(): Promise<{
    streams: Array<{ id: string; command: string; cwd: string; startTime: string }>;
  }> {
    return socketService.sendCommandUnified('terminal', 'getActiveStreams', {});
  }

  // =============================================================================
  // AI Commands
  // =============================================================================

  /**
   * Get AI status
   */
  async getAIStatus(): Promise<AIStatus> {
    return socketService.sendCommandUnified<AIStatus>('ai', 'getStatus', {});
  }

  /**
   * Get available AI extensions
   */
  async getAIExtensions(): Promise<AIExtensionInfo[]> {
    const response = await socketService.sendCommandUnified<{ extensions: AIExtensionInfo[] }>(
      'ai',
      'getExtensions',
      {}
    );
    return response.extensions;
  }

  /**
   * Create a new AI chat session
   */
  async createAISession(): Promise<AIChatSession> {
    const response = await socketService.sendCommandUnified<{ session: AIChatSession }>(
      'ai',
      'createSession',
      {}
    );
    return response.session;
  }

  /**
   * Get AI session
   */
  async getAISession(sessionId: string): Promise<AIChatSession> {
    const response = await socketService.sendCommandUnified<{ session: AIChatSession }>(
      'ai',
      'getSession',
      { sessionId }
    );
    return response.session;
  }

  /**
   * List all AI sessions
   */
  async listAISessions(): Promise<AIChatSession[]> {
    const response = await socketService.sendCommandUnified<{ sessions: AIChatSession[] }>(
      'ai',
      'listSessions',
      {}
    );
    return response.sessions;
  }

  /**
   * Delete AI session
   */
  async deleteAISession(sessionId: string): Promise<boolean> {
    const response = await socketService.sendCommandUnified<{ success: boolean }>(
      'ai',
      'deleteSession',
      { sessionId }
    );
    return response.success;
  }

  /**
   * Send message to AI
   */
  async sendAIMessage(
    sessionId: string,
    message: string,
    options: { includeContext?: boolean; selectedText?: string } = {}
  ): Promise<AIMessage> {
    const response = await socketService.sendCommandUnified<{ message: AIMessage }>(
      'ai',
      'sendMessage',
      {
        sessionId,
        message,
        includeContext: options.includeContext,
        selectedText: options.selectedText,
      }
    );
    return response.message;
  }

  // =============================================================================
  // Git/Source Control Commands
  // =============================================================================

  /**
   * Get git status (list of changed files)
   */
  async getGitStatus(): Promise<GitFileStatus[]> {
    const response = await socketService.sendCommandUnified<{ files: GitFileStatus[] }>(
      'git',
      'status',
      {}
    );
    return response.files;
  }

  /**
   * Get diff for a file
   */
  async getGitDiff(filePath?: string, staged?: boolean): Promise<string> {
    const response = await socketService.sendCommandUnified<{ diff: string }>(
      'git',
      'diff',
      { filePath, staged }
    );
    return response.diff;
  }

  /**
   * Get original file content from git
   */
  async getGitFileContent(filePath: string, ref?: string): Promise<{ content: string; isNew: boolean }> {
    return socketService.sendCommandUnified('git', 'show', { filePath, ref });
  }

  /**
   * Stage a file
   */
  async stageFile(filePath: string): Promise<void> {
    await socketService.sendCommandUnified('git', 'stage', { filePath });
  }

  /**
   * Unstage a file
   */
  async unstageFile(filePath: string): Promise<void> {
    await socketService.sendCommandUnified('git', 'unstage', { filePath });
  }

  /**
   * Discard changes in a file
   */
  async discardChanges(filePath: string): Promise<void> {
    await socketService.sendCommandUnified('git', 'discard', { filePath });
  }

  /**
   * Get current git branch
   */
  async getGitBranch(): Promise<string> {
    const response = await socketService.sendCommandUnified<{ branch: string }>(
      'git',
      'branch',
      {}
    );
    return response.branch;
  }
}

/**
 * Terminal info from VSCode
 */
export interface TerminalInfo {
  id: string;
  name: string;
  processId: number | undefined;
  isActive: boolean;
  createdAt: string;
}

/**
 * Execute command result
 */
export interface ExecuteCommandResult {
  terminalId: string;
  executed: boolean;
  output?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  cwd?: string;
}

/**
 * Terminal creation options
 */
export interface CreateTerminalOptions {
  name?: string;
  cwd?: string;
  env?: Record<string, string>;
  shellPath?: string;
  shellArgs?: string[];
}

/**
 * AI extension types
 */
export type AIExtensionType = 'claude-code' | 'copilot' | 'codeium' | 'none';

/**
 * AI extension info
 */
export interface AIExtensionInfo {
  type: AIExtensionType;
  name: string;
  isActive: boolean;
  extensionId: string;
}

/**
 * AI message structure
 */
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

/**
 * AI chat session
 */
export interface AIChatSession {
  id: string;
  extensionType: AIExtensionType;
  messages: AIMessage[];
  createdAt: string;
  lastActivity: string;
}

/**
 * AI status
 */
export interface AIStatus {
  available: boolean;
  activeExtension: AIExtensionInfo | null;
  extensionCount: number;
}

/**
 * Git file status
 */
export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
  modified: boolean;
  added: boolean;
  deleted: boolean;
  renamed: boolean;
  untracked: boolean;
}

export const vscodeAPI = new VSCodeAPI();
