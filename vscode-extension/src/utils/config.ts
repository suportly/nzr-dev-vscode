import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Configuration manager for the VSCode extension
 * Reads settings from VSCode configuration
 */
export class Config {
  private static instance: Config;
  private _jwtSecret: string;

  private constructor() {
    // Generate a random secret for this session
    this._jwtSecret = crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  /**
   * Get configuration value with fallback
   */
  private get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration('nzr-dev');
    return config.get<T>(key, defaultValue);
  }

  /**
   * Local WebSocket server port for direct connections
   */
  get localPort(): number {
    return this.get<number>('localPort', 3002);
  }

  /**
   * Local relay server port (used for tunnel connections)
   */
  get relayPort(): number {
    return this.get<number>('relayPort', 3004);
  }

  /**
   * Whether mDNS/Bonjour discovery is enabled
   */
  get enableMdns(): boolean {
    return this.get<boolean>('enableMdns', true);
  }

  /**
   * Whether to automatically start tunnel on activation
   */
  get autoStartTunnel(): boolean {
    return this.get<boolean>('autoStartTunnel', false);
  }

  /**
   * Token expiration time in seconds
   */
  get tokenExpirationSeconds(): number {
    return this.get<number>('tokenExpirationSeconds', 300); // 5 minutes
  }

  /**
   * Session timeout in hours
   */
  get sessionTimeoutHours(): number {
    return this.get<number>('sessionTimeoutHours', 24);
  }

  /**
   * Maximum file size to read (in bytes)
   */
  get maxFileSize(): number {
    return this.get<number>('maxFileSize', 5 * 1024 * 1024); // 5MB
  }

  /**
   * JWT secret for signing tokens
   */
  get jwtSecret(): string {
    return this._jwtSecret;
  }
}
