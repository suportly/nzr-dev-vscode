import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

const logger = new Logger('NZR Terminal');

/**
 * Streaming terminal process info
 */
interface StreamingProcess {
  id: string;
  process: ChildProcess;
  command: string;
  cwd: string;
  startTime: Date;
  output: string[];
}

/**
 * Terminal information
 */
export interface TerminalInfo {
  id: string;
  name: string;
  processId: number | undefined;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Terminal output event data
 */
export interface TerminalOutputData {
  terminalId: string;
  data: string;
}

/**
 * Terminal execution result
 */
export interface ExecutionResult {
  terminalId: string;
  command: string;
  startTime: Date;
  endTime?: Date;
  output: string[];
  exitCode?: number;
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
 * Service for managing VSCode terminals
 */
export class TerminalService extends EventEmitter {
  private static instance: TerminalService;
  private terminals: Map<string, vscode.Terminal> = new Map();
  private terminalMetadata: Map<string, { createdAt: Date; processId?: number }> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private disposables: vscode.Disposable[] = [];

  // Track current working directory for captureOutput mode
  private currentCwd: string | null = null;
  private terminalIdCounter = 0;

  // Streaming processes for real-time output
  private streamingProcesses: Map<string, StreamingProcess> = new Map();
  private streamingIdCounter = 0;

  // Pseudoterminal for mirroring mobile commands output
  private nzrTerminal: vscode.Terminal | null = null;
  private nzrWriteEmitter: vscode.EventEmitter<string> | null = null;

  private constructor() {
    super();
    this.setupTerminalListeners();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService();
    }
    return TerminalService.instance;
  }

  /**
   * Setup listeners for terminal events
   */
  private setupTerminalListeners(): void {
    // Listen for terminal open
    const openDisposable = vscode.window.onDidOpenTerminal((terminal) => {
      const id = this.getTerminalId(terminal);
      if (!this.terminals.has(id)) {
        this.registerTerminal(terminal, id);
      }
    });

    // Listen for terminal close
    const closeDisposable = vscode.window.onDidCloseTerminal((terminal) => {
      const id = this.findTerminalId(terminal);
      if (id) {
        this.terminals.delete(id);
        this.terminalMetadata.delete(id);
        this.outputBuffers.delete(id);
        this.emit('terminalClosed', { terminalId: id });
        logger.debug(`Terminal closed: ${id}`);
      }
    });

    // Listen for active terminal change
    const activeDisposable = vscode.window.onDidChangeActiveTerminal((terminal) => {
      if (terminal) {
        const id = this.findTerminalId(terminal);
        if (id) {
          this.emit('activeTerminalChanged', { terminalId: id });
        }
      }
    });

    this.disposables.push(openDisposable, closeDisposable, activeDisposable);
  }

  /**
   * Register existing terminals on initialization
   */
  initialize(): void {
    vscode.window.terminals.forEach((terminal) => {
      const id = this.getTerminalId(terminal);
      this.registerTerminal(terminal, id);
    });
    logger.info(`Initialized with ${this.terminals.size} existing terminals`);
  }

  /**
   * Get or create the NZR output terminal (Pseudoterminal)
   * This terminal shows output from commands executed via mobile
   */
  private getOrCreateNzrTerminal(): vscode.Terminal {
    // Check if terminal still exists
    if (this.nzrTerminal) {
      const exists = vscode.window.terminals.some((t) => t === this.nzrTerminal);
      if (!exists) {
        this.nzrTerminal = null;
        this.nzrWriteEmitter = null;
      }
    }

    if (!this.nzrTerminal) {
      // Create write emitter for the pseudoterminal
      this.nzrWriteEmitter = new vscode.EventEmitter<string>();

      const pty: vscode.Pseudoterminal = {
        onDidWrite: this.nzrWriteEmitter.event,
        open: () => {
          this.writeToNzrTerminal('\x1b[1;36m=== NZR Mobile Terminal ===\x1b[0m\r\n');
          this.writeToNzrTerminal('\x1b[90mCommands executed from mobile app will appear here\x1b[0m\r\n\r\n');
        },
        close: () => {
          this.nzrTerminal = null;
          this.nzrWriteEmitter = null;
        },
      };

      this.nzrTerminal = vscode.window.createTerminal({
        name: 'NZR Mobile',
        pty,
      });
    }

    return this.nzrTerminal;
  }

  /**
   * Write text to the NZR terminal
   */
  private writeToNzrTerminal(text: string): void {
    if (this.nzrWriteEmitter) {
      // Convert \n to \r\n for proper terminal display
      const formatted = text.replace(/\n/g, '\r\n');
      this.nzrWriteEmitter.fire(formatted);
    }
  }

  /**
   * Show the NZR terminal
   */
  showNzrTerminal(preserveFocus = true): void {
    const terminal = this.getOrCreateNzrTerminal();
    terminal.show(preserveFocus);
  }

  /**
   * Register a terminal
   */
  private registerTerminal(terminal: vscode.Terminal, id: string): void {
    this.terminals.set(id, terminal);
    this.terminalMetadata.set(id, { createdAt: new Date() });
    this.outputBuffers.set(id, []);

    // Get process ID if available
    terminal.processId.then((pid) => {
      const metadata = this.terminalMetadata.get(id);
      if (metadata) {
        metadata.processId = pid;
      }
    });

    logger.debug(`Registered terminal: ${id} (${terminal.name})`);
  }

  /**
   * Generate a terminal ID
   */
  private getTerminalId(terminal: vscode.Terminal): string {
    return `terminal_${++this.terminalIdCounter}`;
  }

  /**
   * Find terminal ID by terminal instance
   */
  private findTerminalId(terminal: vscode.Terminal): string | undefined {
    for (const [id, t] of this.terminals) {
      if (t === terminal) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * List all terminals
   */
  listTerminals(): TerminalInfo[] {
    const activeTerminal = vscode.window.activeTerminal;
    const infos: TerminalInfo[] = [];

    for (const [id, terminal] of this.terminals) {
      const metadata = this.terminalMetadata.get(id);
      infos.push({
        id,
        name: terminal.name,
        processId: metadata?.processId,
        isActive: terminal === activeTerminal,
        createdAt: metadata?.createdAt || new Date(),
      });
    }

    return infos;
  }

  /**
   * Create a new terminal
   */
  async createTerminal(options: CreateTerminalOptions = {}): Promise<TerminalInfo> {
    const terminalOptions: vscode.TerminalOptions = {
      name: options.name || 'NZR Terminal',
      cwd: options.cwd ? vscode.Uri.file(options.cwd) : undefined,
      env: options.env,
      shellPath: options.shellPath,
      shellArgs: options.shellArgs,
    };

    const terminal = vscode.window.createTerminal(terminalOptions);
    const id = this.getTerminalId(terminal);
    this.registerTerminal(terminal, id);

    // Wait a bit for the terminal to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pid = await terminal.processId;
    const metadata = this.terminalMetadata.get(id);
    if (metadata) {
      metadata.processId = pid;
    }

    logger.info(`Created terminal: ${id} (${terminal.name})`);

    return {
      id,
      name: terminal.name,
      processId: pid,
      isActive: vscode.window.activeTerminal === terminal,
      createdAt: metadata?.createdAt || new Date(),
    };
  }

  /**
   * Execute a command in a terminal
   */
  async executeCommand(
    terminalId: string | undefined,
    command: string,
    options: { show?: boolean; clearBuffer?: boolean } = {}
  ): Promise<{ terminalId: string; executed: boolean }> {
    let terminal: vscode.Terminal | undefined;
    let id = terminalId;

    if (terminalId) {
      terminal = this.terminals.get(terminalId);
      if (!terminal) {
        throw new Error(`Terminal not found: ${terminalId}`);
      }
    } else {
      // Use active terminal or create new one
      terminal = vscode.window.activeTerminal;
      if (terminal) {
        id = this.findTerminalId(terminal);
      }

      if (!terminal) {
        const info = await this.createTerminal({ name: 'NZR Command' });
        terminal = this.terminals.get(info.id);
        id = info.id;
      }
    }

    if (!terminal || !id) {
      throw new Error('Failed to get or create terminal');
    }

    // Clear output buffer if requested
    if (options.clearBuffer) {
      this.outputBuffers.set(id, []);
    }

    // Show terminal if requested
    if (options.show !== false) {
      terminal.show();
    }

    // Send command to terminal
    terminal.sendText(command);

    logger.debug(`Executed command in ${id}: ${command.substring(0, 50)}...`);

    return { terminalId: id, executed: true };
  }

  /**
   * Execute a command and capture output using child_process
   * This is useful when you need to see the command output
   */
  async executeWithOutput(
    command: string,
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number; cwd?: string }> {
    // Use provided cwd, or stored cwd, or workspace folder
    const cwd = options.cwd || this.getCwd();
    const timeout = options.timeout || 30000; // 30 seconds default

    logger.debug(`Executing command with output capture in ${cwd}: ${command.substring(0, 50)}...`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });

      logger.debug(`Command completed successfully`);
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        cwd,
      };
    } catch (error: any) {
      // exec throws on non-zero exit code
      logger.debug(`Command failed with exit code: ${error.code || 1}`);
      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message || 'Command failed',
        exitCode: error.code || 1,
        cwd,
      };
    }
  }

  /**
   * Execute a command with streaming output
   * Emits 'output' events as data arrives
   * Also mirrors output to NZR terminal in VSCode
   */
  executeStreaming(
    command: string,
    options: { cwd?: string; showInVscode?: boolean } = {}
  ): { streamId: string; promise: Promise<{ exitCode: number; output: string }> } {
    const cwd = options.cwd || this.getCwd();
    const streamId = `stream_${++this.streamingIdCounter}`;
    const showInVscode = options.showInVscode !== false; // Default to true

    logger.info(`Starting streaming command [${streamId}]: ${command.substring(0, 50)}...`);

    // Show and write command to NZR terminal
    if (showInVscode) {
      this.getOrCreateNzrTerminal();
      this.showNzrTerminal(true); // Show but preserve focus
      this.writeToNzrTerminal(`\x1b[1;33m$ ${command}\x1b[0m\r\n`);
    }

    // Determine shell based on platform
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : os.userInfo().shell || '/bin/bash';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const streamingProcess: StreamingProcess = {
      id: streamId,
      process: proc,
      command,
      cwd,
      startTime: new Date(),
      output: [],
    };

    this.streamingProcesses.set(streamId, streamingProcess);

    // Emit start event
    this.emit('streamStart', {
      streamId,
      command,
      cwd,
    });

    const promise = new Promise<{ exitCode: number; output: string }>((resolve) => {
      let allOutput = '';

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        allOutput += text;
        streamingProcess.output.push(text);

        logger.info(`[${streamId}] stdout: ${text.substring(0, 100)}`);

        // Write to NZR terminal
        if (showInVscode) {
          this.writeToNzrTerminal(text);
        }

        logger.info(`[${streamId}] EMITTING output event with ${text.length} chars`);
        this.emit('output', {
          streamId,
          type: 'stdout',
          data: text,
        });
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        allOutput += text;
        streamingProcess.output.push(text);

        logger.debug(`[${streamId}] stderr: ${text.substring(0, 100)}`);

        // Write to NZR terminal (in red)
        if (showInVscode) {
          this.writeToNzrTerminal(`\x1b[31m${text}\x1b[0m`);
        }

        this.emit('output', {
          streamId,
          type: 'stderr',
          data: text,
        });
      });

      // Handle process exit
      proc.on('close', (code) => {
        const exitCode = code ?? 0;
        logger.info(`[${streamId}] Process exited with code: ${exitCode}`);

        // Write exit status to NZR terminal
        if (showInVscode) {
          if (exitCode === 0) {
            this.writeToNzrTerminal(`\x1b[32m✓ Exit code: ${exitCode}\x1b[0m\r\n\r\n`);
          } else {
            this.writeToNzrTerminal(`\x1b[31m✗ Exit code: ${exitCode}\x1b[0m\r\n\r\n`);
          }
        }

        this.emit('streamEnd', {
          streamId,
          exitCode,
          output: allOutput,
        });

        this.streamingProcesses.delete(streamId);
        resolve({ exitCode, output: allOutput });
      });

      // Handle errors
      proc.on('error', (error) => {
        logger.error(`[${streamId}] Process error: ${error.message}`);

        // Write error to NZR terminal
        if (showInVscode) {
          this.writeToNzrTerminal(`\x1b[31mError: ${error.message}\x1b[0m\r\n\r\n`);
        }

        this.emit('output', {
          streamId,
          type: 'stderr',
          data: `Error: ${error.message}\n`,
        });

        this.emit('streamEnd', {
          streamId,
          exitCode: 1,
          output: allOutput + `\nError: ${error.message}`,
        });

        this.streamingProcesses.delete(streamId);
        resolve({ exitCode: 1, output: allOutput });
      });
    });

    return { streamId, promise };
  }

  /**
   * Kill a streaming process
   */
  killStream(streamId: string): boolean {
    const streaming = this.streamingProcesses.get(streamId);
    if (!streaming) {
      return false;
    }

    streaming.process.kill('SIGTERM');
    return true;
  }

  /**
   * Get active streaming processes
   */
  getActiveStreams(): Array<{ id: string; command: string; cwd: string; startTime: Date }> {
    return Array.from(this.streamingProcesses.values()).map((s) => ({
      id: s.id,
      command: s.command,
      cwd: s.cwd,
      startTime: s.startTime,
    }));
  }

  /**
   * Set the current working directory for captureOutput commands
   */
  setCwd(cwd: string): void {
    this.currentCwd = cwd;
    logger.debug(`Set current working directory to: ${cwd}`);
  }

  /**
   * Get the current working directory
   */
  getCwd(): string {
    if (this.currentCwd) {
      return this.currentCwd;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder?.uri.fsPath || process.cwd();
  }

  /**
   * Send input to a terminal (for control signals like Ctrl+C)
   */
  async sendInput(terminalId: string, input: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    terminal.sendText(input, false);
    logger.debug(`Sent input to ${terminalId}: ${input.length} chars`);
  }

  /**
   * Send Ctrl+C to interrupt current process
   */
  async sendInterrupt(terminalId: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    // Send Ctrl+C (ASCII 3)
    terminal.sendText('\x03', false);
    logger.debug(`Sent interrupt to ${terminalId}`);
  }

  /**
   * Show a terminal
   */
  async showTerminal(terminalId: string, preserveFocus = true): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    terminal.show(preserveFocus);
  }

  /**
   * Hide the terminal panel
   */
  async hideTerminal(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closePanel');
  }

  /**
   * Dispose a terminal
   */
  async disposeTerminal(terminalId: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    terminal.dispose();
    // The close event handler will clean up the maps
  }

  /**
   * Get terminal output buffer
   */
  getOutput(terminalId: string): string[] {
    return this.outputBuffers.get(terminalId) || [];
  }

  /**
   * Clear terminal output buffer
   */
  clearOutput(terminalId: string): void {
    this.outputBuffers.set(terminalId, []);
  }

  /**
   * Get terminal by ID
   */
  getTerminal(terminalId: string): vscode.Terminal | undefined {
    return this.terminals.get(terminalId);
  }

  /**
   * Check if a terminal exists
   */
  hasTerminal(terminalId: string): boolean {
    return this.terminals.has(terminalId);
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.terminals.clear();
    this.terminalMetadata.clear();
    this.outputBuffers.clear();
    this.removeAllListeners();

    // Dispose NZR terminal
    if (this.nzrWriteEmitter) {
      this.nzrWriteEmitter.dispose();
      this.nzrWriteEmitter = null;
    }
    if (this.nzrTerminal) {
      this.nzrTerminal.dispose();
      this.nzrTerminal = null;
    }
  }
}

export const terminalService = TerminalService.getInstance();
