import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

/**
 * Cursor position in the editor
 */
export interface CursorPosition {
  line: number;
  column: number;
}

/**
 * Selection range in the editor
 */
export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
  text: string;
}

/**
 * Current editor state
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
 * Editor service events
 */
export interface EditorServiceEvents {
  stateChanged: (state: EditorState) => void;
  fileOpened: (filePath: string) => void;
  fileClosed: (filePath: string) => void;
  fileSaved: (filePath: string) => void;
  cursorMoved: (position: CursorPosition) => void;
  selectionChanged: (selection: SelectionRange | null) => void;
}

/**
 * Service for editor state tracking and operations
 */
export class EditorService extends EventEmitter {
  private static instance: EditorService;
  private logger: Logger;
  private disposables: vscode.Disposable[] = [];
  private currentState: EditorState;

  private constructor() {
    super();
    this.logger = new Logger('NZR Editor');
    this.currentState = this.createEmptyState();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EditorService {
    if (!EditorService.instance) {
      EditorService.instance = new EditorService();
    }
    return EditorService.instance;
  }

  /**
   * Initialize editor listeners
   */
  initialize(): void {
    // Listen for active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.handleEditorChange(editor);
      })
    );

    // Listen for cursor/selection changes
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          this.handleSelectionChange(event);
        }
      })
    );

    // Listen for visible range changes (scrolling)
    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          this.handleVisibleRangeChange(event);
        }
      })
    );

    // Listen for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && event.document === activeEditor.document) {
          this.updateState();
        }
      })
    );

    // Listen for document save
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        const filePath = vscode.workspace.asRelativePath(document.uri, false);
        this.logger.debug(`File saved: ${filePath}`);
        this.emit('fileSaved', filePath);
        this.updateState();
      })
    );

    // Listen for document close
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        const filePath = vscode.workspace.asRelativePath(document.uri, false);
        this.logger.debug(`File closed: ${filePath}`);
        this.emit('fileClosed', filePath);
      })
    );

    // Initialize with current editor
    this.handleEditorChange(vscode.window.activeTextEditor);

    this.logger.info('Editor service initialized');
  }

  /**
   * Dispose listeners
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.logger.info('Editor service disposed');
  }

  /**
   * Get current editor state
   */
  getState(): EditorState {
    return { ...this.currentState };
  }

  /**
   * Handle active editor change
   */
  private handleEditorChange(editor: vscode.TextEditor | undefined): void {
    if (editor) {
      const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
      this.logger.debug(`Editor changed: ${filePath}`);
      this.emit('fileOpened', filePath);
    }
    this.updateState();
  }

  /**
   * Handle selection change
   */
  private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    const selection = event.selections[0];
    if (!selection) return;

    const cursor: CursorPosition = {
      line: selection.active.line,
      column: selection.active.character,
    };

    this.emit('cursorMoved', cursor);

    if (!selection.isEmpty) {
      const text = event.textEditor.document.getText(selection);
      const selectionRange: SelectionRange = {
        start: { line: selection.start.line, column: selection.start.character },
        end: { line: selection.end.line, column: selection.end.character },
        text,
      };
      this.emit('selectionChanged', selectionRange);
    } else {
      this.emit('selectionChanged', null);
    }

    this.updateState();
  }

  /**
   * Handle visible range change (scroll)
   */
  private handleVisibleRangeChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    this.updateState();
  }

  /**
   * Update current state and emit change event
   */
  private updateState(): void {
    const editor = vscode.window.activeTextEditor;
    const newState = editor ? this.createStateFromEditor(editor) : this.createEmptyState();

    // Check if state actually changed
    if (JSON.stringify(newState) !== JSON.stringify(this.currentState)) {
      this.currentState = newState;
      this.emit('stateChanged', newState);
    }
  }

  /**
   * Create state from active editor
   */
  private createStateFromEditor(editor: vscode.TextEditor): EditorState {
    const document = editor.document;
    const selection = editor.selection;
    const visibleRanges = editor.visibleRanges;

    const filePath = vscode.workspace.asRelativePath(document.uri, false);
    const fileName = filePath.split('/').pop() || null;

    let selectionRange: SelectionRange | null = null;
    if (!selection.isEmpty) {
      selectionRange = {
        start: { line: selection.start.line, column: selection.start.character },
        end: { line: selection.end.line, column: selection.end.character },
        text: document.getText(selection),
      };
    }

    let visibleRange: { start: number; end: number } | null = null;
    if (visibleRanges.length > 0) {
      visibleRange = {
        start: visibleRanges[0].start.line,
        end: visibleRanges[visibleRanges.length - 1].end.line,
      };
    }

    return {
      isActive: true,
      filePath,
      fileName,
      language: document.languageId,
      cursor: {
        line: selection.active.line,
        column: selection.active.character,
      },
      selection: selectionRange,
      isDirty: document.isDirty,
      lineCount: document.lineCount,
      visibleRange,
    };
  }

  /**
   * Create empty state (no active editor)
   */
  private createEmptyState(): EditorState {
    return {
      isActive: false,
      filePath: null,
      fileName: null,
      language: null,
      cursor: null,
      selection: null,
      isDirty: false,
      lineCount: 0,
      visibleRange: null,
    };
  }

  /**
   * Navigate to a specific position
   */
  async goToPosition(line: number, column: number = 0): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor');
    }

    const position = new vscode.Position(line, column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );

    this.logger.debug(`Navigated to line ${line}, column ${column}`);
  }

  /**
   * Set selection range
   */
  async setSelection(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor');
    }

    const start = new vscode.Position(startLine, startColumn);
    const end = new vscode.Position(endLine, endColumn);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);

    this.logger.debug(`Set selection from ${startLine}:${startColumn} to ${endLine}:${endColumn}`);
  }

  /**
   * Get current selection text
   */
  getSelectionText(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return null;
    }
    return editor.document.getText(editor.selection);
  }

  /**
   * Insert text at cursor position
   */
  async insertText(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor');
    }

    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, text);
    });

    this.logger.debug(`Inserted text at cursor`);
  }

  /**
   * Replace selection with text
   */
  async replaceSelection(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor');
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(editor.selection, text);
    });

    this.logger.debug(`Replaced selection with text`);
  }

  /**
   * Get text at line
   */
  getLineText(line: number): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || line < 0 || line >= editor.document.lineCount) {
      return null;
    }
    return editor.document.lineAt(line).text;
  }

  /**
   * Get visible text
   */
  getVisibleText(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.visibleRanges.length === 0) {
      return null;
    }

    const visibleRange = new vscode.Range(
      editor.visibleRanges[0].start,
      editor.visibleRanges[editor.visibleRanges.length - 1].end
    );

    return editor.document.getText(visibleRange);
  }
}

export const editorService = EditorService.getInstance();
