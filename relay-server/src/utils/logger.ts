/**
 * Logger utility for the relay server
 * Simple console-based logging with structured output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
    };
  }

  private output(entry: LogEntry): void {
    const { timestamp, level, message, context } = entry;
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      this.output(this.formatEntry('debug', message, context));
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.output(this.formatEntry('info', message, context));
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.output(this.formatEntry('warn', message, context));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = error instanceof Error
      ? { error: error.message, stack: error.stack, ...context }
      : { error, ...context };
    this.output(this.formatEntry('error', message, errorContext));
  }
}

export const logger = new Logger();
