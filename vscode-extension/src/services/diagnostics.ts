import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

const logger = new Logger('NZR Diagnostics');

/**
 * Diagnostic entry
 */
export interface DiagnosticEntry {
  file: string;
  fileName: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

/**
 * Diagnostics summary for a file
 */
export interface DiagnosticsSummary {
  file: string;
  fileName: string;
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
  total: number;
}

/**
 * Workspace diagnostics change event
 */
export interface DiagnosticsChangeEvent {
  added: DiagnosticEntry[];
  removed: DiagnosticEntry[];
  changed: DiagnosticEntry[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    filesWithErrors: string[];
    filesWithWarnings: string[];
  };
}

/**
 * Notification throttle config
 */
interface ThrottleConfig {
  minInterval: number; // Minimum time between notifications (ms)
  batchWindow: number; // Time to batch changes (ms)
  maxBatchSize: number; // Maximum batch size before forcing notification
}

/**
 * Service for monitoring VSCode diagnostics (errors, warnings)
 */
export class DiagnosticsService extends EventEmitter {
  private static instance: DiagnosticsService;
  private disposables: vscode.Disposable[] = [];
  private previousDiagnostics: Map<string, DiagnosticEntry[]> = new Map();
  private pendingChanges: DiagnosticsChangeEvent[] = [];
  private throttleTimer: NodeJS.Timeout | null = null;
  private lastNotificationTime = 0;

  private readonly throttleConfig: ThrottleConfig = {
    minInterval: 2000, // 2 seconds minimum between notifications
    batchWindow: 500, // 500ms to batch changes
    maxBatchSize: 10, // Force notification after 10 changes
  };

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DiagnosticsService {
    if (!DiagnosticsService.instance) {
      DiagnosticsService.instance = new DiagnosticsService();
    }
    return DiagnosticsService.instance;
  }

  /**
   * Initialize diagnostics monitoring
   */
  initialize(): void {
    // Subscribe to diagnostics changes
    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(
      (event) => this.handleDiagnosticsChange(event)
    );

    this.disposables.push(diagnosticsDisposable);

    // Take initial snapshot
    this.captureCurrentDiagnostics();

    logger.info('Diagnostics monitoring initialized');
  }

  /**
   * Capture current diagnostics state
   */
  private captureCurrentDiagnostics(): void {
    const all = vscode.languages.getDiagnostics();
    this.previousDiagnostics.clear();

    for (const [uri, diagnostics] of all) {
      const entries = this.convertDiagnostics(uri, diagnostics);
      if (entries.length > 0) {
        this.previousDiagnostics.set(uri.toString(), entries);
      }
    }
  }

  /**
   * Handle diagnostics change event
   */
  private handleDiagnosticsChange(event: vscode.DiagnosticChangeEvent): void {
    const changes: DiagnosticsChangeEvent = {
      added: [],
      removed: [],
      changed: [],
      summary: {
        totalErrors: 0,
        totalWarnings: 0,
        filesWithErrors: [],
        filesWithWarnings: [],
      },
    };

    for (const uri of event.uris) {
      const currentDiagnostics = vscode.languages.getDiagnostics(uri);
      const currentEntries = this.convertDiagnostics(uri, currentDiagnostics);
      const previousEntries = this.previousDiagnostics.get(uri.toString()) || [];

      // Find added diagnostics
      for (const entry of currentEntries) {
        const exists = previousEntries.some(
          (prev) =>
            prev.line === entry.line &&
            prev.column === entry.column &&
            prev.message === entry.message
        );
        if (!exists) {
          changes.added.push(entry);
        }
      }

      // Find removed diagnostics
      for (const entry of previousEntries) {
        const exists = currentEntries.some(
          (curr) =>
            curr.line === entry.line &&
            curr.column === entry.column &&
            curr.message === entry.message
        );
        if (!exists) {
          changes.removed.push(entry);
        }
      }

      // Update stored diagnostics
      if (currentEntries.length > 0) {
        this.previousDiagnostics.set(uri.toString(), currentEntries);
      } else {
        this.previousDiagnostics.delete(uri.toString());
      }
    }

    // Calculate summary
    changes.summary = this.calculateSummary();

    // Add to pending changes and schedule notification
    if (changes.added.length > 0 || changes.removed.length > 0) {
      this.scheduleBatchedNotification(changes);
    }
  }

  /**
   * Convert VSCode diagnostics to our format
   */
  private convertDiagnostics(
    uri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[]
  ): DiagnosticEntry[] {
    return diagnostics.map((d) => ({
      file: uri.fsPath,
      fileName: uri.path.split('/').pop() || uri.fsPath,
      line: d.range.start.line + 1, // 1-indexed
      column: d.range.start.character + 1,
      message: d.message,
      severity: this.mapSeverity(d.severity),
      source: d.source,
      code: typeof d.code === 'object' ? d.code.value : d.code,
    }));
  }

  /**
   * Map VSCode severity to string
   */
  private mapSeverity(
    severity: vscode.DiagnosticSeverity
  ): 'error' | 'warning' | 'info' | 'hint' {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'error';
      case vscode.DiagnosticSeverity.Warning:
        return 'warning';
      case vscode.DiagnosticSeverity.Information:
        return 'info';
      case vscode.DiagnosticSeverity.Hint:
        return 'hint';
    }
  }

  /**
   * Calculate current diagnostics summary
   */
  private calculateSummary(): DiagnosticsChangeEvent['summary'] {
    const summary: DiagnosticsChangeEvent['summary'] = {
      totalErrors: 0,
      totalWarnings: 0,
      filesWithErrors: [],
      filesWithWarnings: [],
    };

    for (const [uri, entries] of this.previousDiagnostics) {
      const hasErrors = entries.some((e) => e.severity === 'error');
      const hasWarnings = entries.some((e) => e.severity === 'warning');

      if (hasErrors) {
        summary.filesWithErrors.push(uri);
      }
      if (hasWarnings) {
        summary.filesWithWarnings.push(uri);
      }

      for (const entry of entries) {
        if (entry.severity === 'error') {
          summary.totalErrors++;
        } else if (entry.severity === 'warning') {
          summary.totalWarnings++;
        }
      }
    }

    return summary;
  }

  /**
   * Schedule batched notification with throttling
   */
  private scheduleBatchedNotification(changes: DiagnosticsChangeEvent): void {
    this.pendingChanges.push(changes);

    // Force notification if batch is large
    if (this.pendingChanges.length >= this.throttleConfig.maxBatchSize) {
      this.sendBatchedNotification();
      return;
    }

    // Clear existing timer
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
    }

    // Check minimum interval
    const now = Date.now();
    const timeSinceLastNotification = now - this.lastNotificationTime;

    if (timeSinceLastNotification < this.throttleConfig.minInterval) {
      // Schedule for later
      const delay = this.throttleConfig.minInterval - timeSinceLastNotification;
      this.throttleTimer = setTimeout(() => {
        this.sendBatchedNotification();
      }, delay);
    } else {
      // Schedule with batch window
      this.throttleTimer = setTimeout(() => {
        this.sendBatchedNotification();
      }, this.throttleConfig.batchWindow);
    }
  }

  /**
   * Send batched notification
   */
  private sendBatchedNotification(): void {
    if (this.pendingChanges.length === 0) return;

    // Merge all pending changes
    const merged: DiagnosticsChangeEvent = {
      added: [],
      removed: [],
      changed: [],
      summary: this.calculateSummary(),
    };

    for (const changes of this.pendingChanges) {
      merged.added.push(...changes.added);
      merged.removed.push(...changes.removed);
      merged.changed.push(...changes.changed);
    }

    // Clear pending
    this.pendingChanges = [];
    this.throttleTimer = null;
    this.lastNotificationTime = Date.now();

    // Emit event
    this.emit('diagnosticsChanged', merged);

    logger.debug(
      `Diagnostics changed: +${merged.added.length} -${merged.removed.length}, ` +
        `${merged.summary.totalErrors} errors, ${merged.summary.totalWarnings} warnings`
    );
  }

  /**
   * Get all current diagnostics
   */
  getAllDiagnostics(): DiagnosticEntry[] {
    const all: DiagnosticEntry[] = [];
    for (const entries of this.previousDiagnostics.values()) {
      all.push(...entries);
    }
    return all;
  }

  /**
   * Get diagnostics for a specific file
   */
  getFileDiagnostics(filePath: string): DiagnosticEntry[] {
    // Find by file path
    for (const [uri, entries] of this.previousDiagnostics) {
      if (uri.includes(filePath)) {
        return entries;
      }
    }
    return [];
  }

  /**
   * Get diagnostics summary for workspace
   */
  getSummary(): DiagnosticsChangeEvent['summary'] {
    return this.calculateSummary();
  }

  /**
   * Get per-file summaries
   */
  getFileSummaries(): DiagnosticsSummary[] {
    const summaries: DiagnosticsSummary[] = [];

    for (const [uri, entries] of this.previousDiagnostics) {
      const summary: DiagnosticsSummary = {
        file: uri,
        fileName: uri.split('/').pop() || uri,
        errors: 0,
        warnings: 0,
        infos: 0,
        hints: 0,
        total: entries.length,
      };

      for (const entry of entries) {
        switch (entry.severity) {
          case 'error':
            summary.errors++;
            break;
          case 'warning':
            summary.warnings++;
            break;
          case 'info':
            summary.infos++;
            break;
          case 'hint':
            summary.hints++;
            break;
        }
      }

      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
    }
    this.disposables.forEach((d) => d.dispose());
    this.previousDiagnostics.clear();
    this.pendingChanges = [];
    this.removeAllListeners();
  }
}

export const diagnosticsService = DiagnosticsService.getInstance();
