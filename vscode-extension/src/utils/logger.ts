import * as vscode from 'vscode';

/**
 * Logger utility for the VSCode extension
 * Outputs to VSCode Output channel for debugging
 */
export class Logger {
  private outputChannel: vscode.OutputChannel;
  private prefix: string;

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
    this.prefix = channelName;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  /**
   * Log info message
   */
  info(message: string): void {
    this.outputChannel.appendLine(this.formatMessage('INFO', message));
  }

  /**
   * Log warning message
   */
  warn(message: string): void {
    this.outputChannel.appendLine(this.formatMessage('WARN', message));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error): void {
    this.outputChannel.appendLine(this.formatMessage('ERROR', message));
    if (error) {
      this.outputChannel.appendLine(`  Stack: ${error.stack}`);
    }
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, error?: Error): void {
    // Only log debug in development mode
    if (process.env.NODE_ENV === 'development') {
      this.outputChannel.appendLine(this.formatMessage('DEBUG', message));
      if (error) {
        this.outputChannel.appendLine(`  Stack: ${error.stack}`);
      }
    }
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * Dispose the output channel
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
