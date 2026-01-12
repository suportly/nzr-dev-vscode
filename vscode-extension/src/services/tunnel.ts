import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

// Dynamic import for localtunnel (CommonJS module)
let localtunnel: typeof import('localtunnel') | null = null;

/**
 * Tunnel state
 */
export type TunnelState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Tunnel service for exposing local relay to the internet
 * Uses localtunnel (free, no signup required)
 */
export class TunnelService extends EventEmitter {
  private static instance: TunnelService;
  private tunnel: Awaited<ReturnType<typeof import('localtunnel')>> | null = null;
  private logger: Logger;
  private _state: TunnelState = 'disconnected';
  private _url: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  private constructor() {
    super();
    this.logger = new Logger('Tunnel');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TunnelService {
    if (!TunnelService.instance) {
      TunnelService.instance = new TunnelService();
    }
    return TunnelService.instance;
  }

  /**
   * Get current state
   */
  get state(): TunnelState {
    return this._state;
  }

  /**
   * Get tunnel URL
   */
  get url(): string | null {
    return this._url;
  }

  /**
   * Check if tunnel is connected
   */
  isConnected(): boolean {
    return this._state === 'connected' && this._url !== null;
  }

  /**
   * Set state and emit event
   */
  private setState(state: TunnelState): void {
    this._state = state;
    this.emit('stateChange', state);
  }

  /**
   * Start tunnel to expose local port
   */
  async connect(port: number, subdomain?: string): Promise<string> {
    if (this._state === 'connected' && this.tunnel) {
      this.logger.warn('Tunnel already connected');
      return this._url!;
    }

    this.setState('connecting');
    this.logger.info(`Starting tunnel for port ${port}...`);

    try {
      // Dynamically import localtunnel
      if (!localtunnel) {
        localtunnel = (await import('localtunnel')).default;
      }

      const options: { port: number; subdomain?: string } = { port };

      // Use subdomain if provided (requires localtunnel pro for guaranteed subdomain)
      if (subdomain) {
        options.subdomain = subdomain;
      }

      this.tunnel = await localtunnel(options);
      this._url = this.tunnel.url;

      this.logger.info(`Tunnel connected: ${this._url}`);
      this.setState('connected');
      this.reconnectAttempts = 0;

      // Handle tunnel close
      this.tunnel.on('close', () => {
        this.logger.warn('Tunnel closed');
        this._url = null;
        this.tunnel = null;

        if (this._state !== 'disconnected') {
          this.setState('disconnected');
          this.emit('closed');

          // Attempt reconnect if not manually disconnected
          this.attemptReconnect(port, subdomain);
        }
      });

      // Handle tunnel error
      this.tunnel.on('error', (err: Error) => {
        this.logger.error('Tunnel error', err);
        this.setState('error');
        this.emit('error', err);
      });

      this.emit('connected', this._url);
      return this._url;
    } catch (error) {
      this.logger.error('Failed to start tunnel', error as Error);
      this.setState('error');
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(port: number, subdomain?: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.warn('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.logger.info(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(port, subdomain);
      } catch (error) {
        this.logger.error('Reconnect failed', error as Error);
      }
    }, delay);
  }

  /**
   * Disconnect tunnel
   */
  async disconnect(): Promise<void> {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.tunnel) {
      this.setState('disconnected');
      return;
    }

    this.logger.info('Disconnecting tunnel...');

    try {
      this.tunnel.close();
      this.tunnel = null;
      this._url = null;
      this.setState('disconnected');
      this.logger.info('Tunnel disconnected');
      this.emit('disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting tunnel', error as Error);
      this.tunnel = null;
      this._url = null;
      this.setState('disconnected');
    }
  }

  /**
   * Restart tunnel (disconnect and reconnect)
   */
  async restart(port: number, subdomain?: string): Promise<string> {
    await this.disconnect();
    return this.connect(port, subdomain);
  }
}

export const tunnelService = TunnelService.getInstance();
