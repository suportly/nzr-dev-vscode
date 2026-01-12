import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';

/**
 * File entry in directory listing
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
 * File content with metadata
 */
export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
  language?: string;
}

/**
 * Service for file operations
 */
export class FilesService {
  private static instance: FilesService;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('NZR Files');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FilesService {
    if (!FilesService.instance) {
      FilesService.instance = new FilesService();
    }
    return FilesService.instance;
  }

  /**
   * Get workspace root URI
   */
  private getWorkspaceRoot(): vscode.Uri | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri;
  }

  /**
   * List files in a directory
   */
  async listFiles(relativePath: string = ''): Promise<FileEntry[]> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    const targetUri = relativePath
      ? vscode.Uri.joinPath(workspaceRoot, relativePath)
      : workspaceRoot;

    try {
      const entries = await vscode.workspace.fs.readDirectory(targetUri);
      const result: FileEntry[] = [];

      for (const [name, type] of entries) {
        // Skip hidden files and common ignore patterns
        if (name.startsWith('.') || this.shouldIgnore(name)) {
          continue;
        }

        const entryPath = relativePath ? path.posix.join(relativePath, name) : name;
        const entryUri = vscode.Uri.joinPath(targetUri, name);

        const entry: FileEntry = {
          name,
          path: entryPath,
          type: type === vscode.FileType.Directory ? 'directory' : 'file',
        };

        // Get file stats for files
        if (type === vscode.FileType.File) {
          try {
            const stat = await vscode.workspace.fs.stat(entryUri);
            entry.size = stat.size;
            entry.modified = stat.mtime;
            entry.extension = path.extname(name).toLowerCase();
          } catch {
            // Ignore stat errors
          }
        }

        result.push(entry);
      }

      // Sort directories first, then by name
      result.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      this.logger.debug(`Listed ${result.length} entries in ${relativePath || '/'}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to list files in ${relativePath}`, error as Error);
      throw new Error(`Failed to list files: ${(error as Error).message}`);
    }
  }

  /**
   * Read file content
   */
  async readFile(relativePath: string, encoding: string = 'utf-8'): Promise<FileContent> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    const fileUri = vscode.Uri.joinPath(workspaceRoot, relativePath);

    try {
      const stat = await vscode.workspace.fs.stat(fileUri);

      // Check file size limit (5MB)
      const maxSize = 5 * 1024 * 1024;
      if (stat.size > maxSize) {
        throw new Error(`File too large (${stat.size} bytes, max ${maxSize})`);
      }

      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      const content = new TextDecoder(encoding).decode(contentBytes);

      // Detect language from extension
      const extension = path.extname(relativePath).toLowerCase();
      const language = this.getLanguageFromExtension(extension);

      this.logger.debug(`Read file ${relativePath} (${stat.size} bytes)`);

      return {
        path: relativePath,
        content,
        encoding,
        size: stat.size,
        language,
      };

    } catch (error) {
      this.logger.error(`Failed to read file ${relativePath}`, error as Error);
      throw new Error(`Failed to read file: ${(error as Error).message}`);
    }
  }

  /**
   * Open a file in the editor
   */
  async openFile(relativePath: string, options?: {
    preview?: boolean;
    viewColumn?: vscode.ViewColumn;
    selection?: { startLine: number; startColumn: number; endLine?: number; endColumn?: number };
  }): Promise<void> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    const fileUri = vscode.Uri.joinPath(workspaceRoot, relativePath);

    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document, {
        preview: options?.preview ?? true,
        viewColumn: options?.viewColumn ?? vscode.ViewColumn.One,
      });

      // Set selection if provided
      if (options?.selection) {
        const { startLine, startColumn, endLine, endColumn } = options.selection;
        const start = new vscode.Position(startLine, startColumn);
        const end = new vscode.Position(
          endLine ?? startLine,
          endColumn ?? startColumn
        );
        editor.selection = new vscode.Selection(start, end);
        editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
      }

      this.logger.info(`Opened file ${relativePath}`);

    } catch (error) {
      this.logger.error(`Failed to open file ${relativePath}`, error as Error);
      throw new Error(`Failed to open file: ${(error as Error).message}`);
    }
  }

  /**
   * Check if file/directory should be ignored
   */
  private shouldIgnore(name: string): boolean {
    const ignorePatterns = [
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      'dist',
      'build',
      'out',
      '.DS_Store',
      'Thumbs.db',
      '__pycache__',
      '.idea',
      '.vscode',
      'coverage',
    ];
    return ignorePatterns.includes(name);
  }

  /**
   * Get language ID from file extension
   */
  private getLanguageFromExtension(extension: string): string {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.json': 'json',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.py': 'python',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.php': 'php',
      '.sql': 'sql',
      '.sh': 'shellscript',
      '.bash': 'shellscript',
      '.zsh': 'shellscript',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.vue': 'vue',
      '.svelte': 'svelte',
    };
    return languageMap[extension] || 'plaintext';
  }

  /**
   * Get file stats
   */
  async getFileStats(relativePath: string): Promise<{
    size: number;
    created: number;
    modified: number;
    type: 'file' | 'directory';
  }> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    const fileUri = vscode.Uri.joinPath(workspaceRoot, relativePath);

    try {
      const stat = await vscode.workspace.fs.stat(fileUri);
      return {
        size: stat.size,
        created: stat.ctime,
        modified: stat.mtime,
        type: stat.type === vscode.FileType.Directory ? 'directory' : 'file',
      };
    } catch (error) {
      this.logger.error(`Failed to get stats for ${relativePath}`, error as Error);
      throw new Error(`Failed to get file stats: ${(error as Error).message}`);
    }
  }

  /**
   * Write file content
   */
  async writeFile(
    relativePath: string,
    content: string,
    options?: { encoding?: string; createBackup?: boolean }
  ): Promise<void> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    const fileUri = vscode.Uri.joinPath(workspaceRoot, relativePath);

    try {
      // Create backup if requested
      if (options?.createBackup) {
        try {
          const existing = await vscode.workspace.fs.readFile(fileUri);
          const backupUri = vscode.Uri.joinPath(
            workspaceRoot,
            `${relativePath}.backup`
          );
          await vscode.workspace.fs.writeFile(backupUri, existing);
          this.logger.debug(`Created backup: ${relativePath}.backup`);
        } catch {
          // Original file doesn't exist, skip backup
        }
      }

      // Encode content to bytes
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(content);

      // Write file
      await vscode.workspace.fs.writeFile(fileUri, contentBytes);

      this.logger.info(`Wrote file ${relativePath} (${contentBytes.length} bytes)`);
    } catch (error) {
      this.logger.error(`Failed to write file ${relativePath}`, error as Error);
      throw new Error(`Failed to write file: ${(error as Error).message}`);
    }
  }

  /**
   * Save active editor
   */
  async saveActiveFile(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return false;
    }

    await editor.document.save();
    this.logger.debug(`Saved active file`);
    return true;
  }

  /**
   * Search files by pattern
   */
  async searchFiles(pattern: string, maxResults: number = 100): Promise<FileEntry[]> {
    try {
      const files = await vscode.workspace.findFiles(
        `**/${pattern}`,
        '**/node_modules/**',
        maxResults
      );

      const workspaceRoot = this.getWorkspaceRoot();
      if (!workspaceRoot) {
        return [];
      }

      const entries: FileEntry[] = [];
      for (const uri of files) {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        entries.push({
          name: path.basename(relativePath),
          path: relativePath,
          type: 'file',
          extension: path.extname(relativePath).toLowerCase(),
        });
      }

      this.logger.debug(`Found ${entries.length} files matching "${pattern}"`);
      return entries;

    } catch (error) {
      this.logger.error(`Failed to search files with pattern ${pattern}`, error as Error);
      throw new Error(`Failed to search files: ${(error as Error).message}`);
    }
  }
}

export const filesService = FilesService.getInstance();
