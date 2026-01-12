import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Logger } from '../utils/logger';
const logger = new Logger('NZR AI Bridge');

/**
 * Find Claude CLI executable path
 */
function findClaudePath(): string | null {
  const possiblePaths = [
    join(homedir(), '.claude', 'local', 'claude'),
    join(homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Supported AI extensions
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
  timestamp: Date;
  isStreaming?: boolean;
}

/**
 * AI chat session
 */
export interface AIChatSession {
  id: string;
  extensionType: AIExtensionType;
  messages: AIMessage[];
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Service for bridging communication with AI extensions
 */
export class AIBridgeService extends EventEmitter {
  private static instance: AIBridgeService;
  private sessions: Map<string, AIChatSession> = new Map();
  private activeExtension: AIExtensionInfo | null = null;
  private messageIdCounter = 0;
  private sessionIdCounter = 0;

  private constructor() {
    super();
    this.detectAIExtensions();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AIBridgeService {
    if (!AIBridgeService.instance) {
      AIBridgeService.instance = new AIBridgeService();
    }
    return AIBridgeService.instance;
  }

  /**
   * Detect available AI extensions
   */
  detectAIExtensions(): AIExtensionInfo[] {
    const extensions: AIExtensionInfo[] = [];

    // Check for Claude Code / Claude Dev
    const claudeExt = vscode.extensions.getExtension('anthropic.claude-code')
      || vscode.extensions.getExtension('saoudrizwan.claude-dev');
    if (claudeExt) {
      extensions.push({
        type: 'claude-code',
        name: 'Claude',
        isActive: claudeExt.isActive,
        extensionId: claudeExt.id,
      });
    }

    // Check for GitHub Copilot
    const copilotExt = vscode.extensions.getExtension('github.copilot-chat')
      || vscode.extensions.getExtension('github.copilot');
    if (copilotExt) {
      extensions.push({
        type: 'copilot',
        name: 'GitHub Copilot',
        isActive: copilotExt.isActive,
        extensionId: copilotExt.id,
      });
    }

    // Check for Codeium
    const codeiumExt = vscode.extensions.getExtension('codeium.codeium');
    if (codeiumExt) {
      extensions.push({
        type: 'codeium',
        name: 'Codeium',
        isActive: codeiumExt.isActive,
        extensionId: codeiumExt.id,
      });
    }

    // Set active extension (prefer Claude, then Copilot, then Codeium)
    const activeOne = extensions.find(e => e.isActive);
    if (activeOne) {
      this.activeExtension = activeOne;
    } else if (extensions.length > 0) {
      this.activeExtension = extensions[0];
    }

    logger.info(`Detected AI extensions: ${extensions.map(e => e.name).join(', ') || 'none'}`);
    return extensions;
  }

  /**
   * Get available AI extensions
   */
  getAvailableExtensions(): AIExtensionInfo[] {
    return this.detectAIExtensions();
  }

  /**
   * Get active AI extension
   */
  getActiveExtension(): AIExtensionInfo | null {
    return this.activeExtension;
  }

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.activeExtension !== null;
  }

  /**
   * Create a new chat session
   */
  createSession(): AIChatSession {
    const session: AIChatSession = {
      id: `session_${++this.sessionIdCounter}`,
      extensionType: this.activeExtension?.type || 'none',
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(session.id, session);
    logger.debug(`Created AI session: ${session.id}`);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AIChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): AIChatSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Send message to AI extension
   */
  async sendMessage(
    sessionId: string,
    content: string,
    options: { includeContext?: boolean; selectedText?: string } = {}
  ): Promise<AIMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!this.activeExtension) {
      throw new Error('No AI extension available');
    }

    // Create user message
    const userMessage: AIMessage = {
      id: `msg_${++this.messageIdCounter}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    session.messages.push(userMessage);
    session.lastActivity = new Date();

    // Emit user message event
    this.emit('message', { sessionId, message: userMessage });

    // Create placeholder for assistant response
    const assistantMessage: AIMessage = {
      id: `msg_${++this.messageIdCounter}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    session.messages.push(assistantMessage);

    // Emit streaming start
    this.emit('streamStart', { sessionId, messageId: assistantMessage.id });

    try {
      // Build context for the AI
      let fullMessage = content;

      if (options.selectedText) {
        fullMessage = `Selected code:\n\`\`\`\n${options.selectedText}\n\`\`\`\n\n${content}`;
      }

      if (options.includeContext) {
        const context = await this.getCurrentContext();
        if (context) {
          fullMessage = `Current file: ${context.filePath}\n\n${fullMessage}`;
        }
      }

      // Attempt to send to AI extension with streaming support
      const response = await this.executeAICommand(fullMessage, sessionId, assistantMessage.id);

      // Update assistant message with response
      assistantMessage.content = response;
      assistantMessage.isStreaming = false;

      // Emit message complete
      this.emit('message', { sessionId, message: assistantMessage });
      this.emit('streamEnd', { sessionId, messageId: assistantMessage.id });

      return assistantMessage;
    } catch (error) {
      // Handle error by creating error message
      assistantMessage.content = error instanceof Error
        ? `Error: ${error.message}`
        : 'An error occurred while processing your request.';
      assistantMessage.isStreaming = false;

      this.emit('message', { sessionId, message: assistantMessage });
      this.emit('streamEnd', { sessionId, messageId: assistantMessage.id });

      throw error;
    }
  }

  /**
   * Execute AI command based on extension type
   */
  private async executeAICommand(
    message: string,
    sessionId?: string,
    messageId?: string
  ): Promise<string> {
    if (!this.activeExtension) {
      throw new Error('No AI extension available');
    }

    try {
      switch (this.activeExtension.type) {
        case 'claude-code':
          return await this.sendToClaudeCode(message, sessionId, messageId);
        case 'copilot':
          return await this.sendToCopilot(message);
        case 'codeium':
          return await this.sendToCodeium(message);
        default:
          throw new Error('Unsupported AI extension');
      }
    } catch (error) {
      logger.error('Failed to execute AI command', error as Error);
      throw error;
    }
  }

  /**
   * Send message to Claude Code CLI with streaming
   */
  private async sendToClaudeCode(
    message: string,
    sessionId?: string,
    assistantMessageId?: string
  ): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder?.uri.fsPath || process.cwd();

    logger.info('Sending message to Claude Code CLI...');

    // Find Claude CLI path
    const claudePath = findClaudePath();
    if (!claudePath) {
      logger.error('Claude CLI not found in any known location');
      await vscode.env.clipboard.writeText(message);
      vscode.window.showWarningMessage(
        'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
        'Copy to Clipboard'
      );
      return 'Claude CLI not installed. Message copied to clipboard. Install with: npm install -g @anthropic-ai/claude-code';
    }

    logger.info(`Found Claude CLI at: ${claudePath}`);

    return new Promise((resolve) => {
      const timeout = 120000; // 2 minute timeout
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      logger.debug(`Spawning Claude CLI with message: ${message.substring(0, 50)}...`);
      logger.debug(`CWD: ${cwd}`);

      // Ensure critical environment variables are set
      const env = {
        ...process.env,
        HOME: homedir(),
        USER: process.env.USER || 'user',
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      };

      // Spawn Claude CLI and pass message via stdin to avoid shell escaping issues
      const proc = spawn(claudePath, ['-p', '--dangerously-skip-permissions'], {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'], // Use pipe for stdin to send message
      });

      // Write message to stdin and close it
      if (proc.stdin) {
        proc.stdin.write(message);
        proc.stdin.end();
      }

      logger.debug(`Claude CLI process started with PID: ${proc.pid}`);

      const timeoutId = setTimeout(() => {
        timedOut = true;
        logger.error(`Claude CLI timed out after ${timeout}ms, killing process`);
        proc.kill('SIGTERM');
      }, timeout);

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.debug(`Claude stdout chunk: ${chunk.substring(0, 100)}...`);

        // Emit streaming chunk if we have session info
        if (sessionId && assistantMessageId) {
          this.emit('streamChunk', {
            sessionId,
            messageId: assistantMessageId,
            chunk,
            content: stdout, // Full content so far
          });
        }
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.debug(`Claude stderr chunk: ${chunk.substring(0, 100)}...`);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          logger.error('Claude CLI timed out');
          resolve('Request timed out. Claude may be processing a complex request.');
          return;
        }

        if (code !== 0 && stderr && !stdout) {
          logger.warn(`Claude CLI stderr: ${stderr}`);
          resolve(stderr.trim() || `Claude CLI exited with code ${code}`);
          return;
        }

        const response = stdout.trim();
        logger.info(`Claude CLI response received (${response.length} chars)`);
        resolve(response || 'No response from Claude');
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error('Claude CLI error', error);
        resolve(`Error: ${error.message || 'Failed to communicate with Claude'}`);
      });
    });
  }

  /**
   * Send message to GitHub Copilot
   */
  private async sendToCopilot(message: string): Promise<string> {
    try {
      // Open Copilot chat
      await vscode.commands.executeCommand('workbench.action.chat.open');

      // Try to send message to inline chat
      await vscode.commands.executeCommand('workbench.action.chat.sendToInput', message);

      return 'Message sent to Copilot Chat.';
    } catch {
      // Fallback
      await vscode.env.clipboard.writeText(message);
      await vscode.commands.executeCommand('workbench.action.chat.open');
      return 'Message copied to clipboard. Please paste it in the Copilot Chat panel.';
    }
  }

  /**
   * Send message to Codeium
   */
  private async sendToCodeium(message: string): Promise<string> {
    try {
      // Try Codeium chat command
      await vscode.commands.executeCommand('codeium.showChat');

      // Copy message for user to paste
      await vscode.env.clipboard.writeText(message);

      return 'Message copied to clipboard. Please paste it in the Codeium chat.';
    } catch {
      throw new Error('Failed to open Codeium chat');
    }
  }

  /**
   * Get current editor context
   */
  private async getCurrentContext(): Promise<{
    filePath: string;
    language: string;
    selectedText?: string;
  } | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const selection = editor.selection;
    const selectedText = selection.isEmpty
      ? undefined
      : editor.document.getText(selection);

    return {
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      selectedText,
    };
  }

  /**
   * Get AI status
   */
  getStatus(): {
    available: boolean;
    activeExtension: AIExtensionInfo | null;
    extensionCount: number;
  } {
    const extensions = this.detectAIExtensions();
    return {
      available: this.isAvailable(),
      activeExtension: this.activeExtension,
      extensionCount: extensions.length,
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.sessions.clear();
    this.removeAllListeners();
  }
}

export const aiBridgeService = AIBridgeService.getInstance();
