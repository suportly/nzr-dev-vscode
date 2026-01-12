import { EventEmitter } from 'events';
import { io, Socket as SocketIOClient } from 'socket.io-client';
import { Message, Command, Response, ErrorResponse } from 'nzr-shared';
import { authService } from './auth';

/**
 * WebSocket connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Connection type
 */
export type ConnectionType = 'local' | 'relay' | 'auto';

/**
 * Connection preference settings
 */
export interface ConnectionPreference {
  type: ConnectionType;
  localAddress?: string;
  relayUrl?: string;
}

/**
 * Pending command with timeout
 */
interface PendingCommand {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * WebSocket client for VSCode extension communication
 * Supports both direct WebSocket (local) and Socket.IO (relay) connections
 */
export class SocketService extends EventEmitter {
  private static instance: SocketService;
  private ws: WebSocket | null = null;
  private socketIO: SocketIOClient | null = null;
  private url: string | null = null;
  private token: string | null = null;
  private state: ConnectionState = 'disconnected';
  private connectionType: ConnectionType = 'auto';
  private activeConnectionType: 'local' | 'relay' | null = null;
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageIdCounter = 0;
  private preference: ConnectionPreference = { type: 'auto' };

  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_MS = 2000;
  private readonly COMMAND_TIMEOUT_MS = 30000;
  private readonly LOCAL_TIMEOUT_MS = 5000;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /**
   * Connect to WebSocket server
   */
  connect(url: string, token: string, deviceName?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === 'connected' || this.state === 'connecting') {
        if (this.url === url) {
          resolve();
          return;
        }
        this.disconnect();
      }

      this.url = url;
      this.token = token;
      this.state = 'connecting';
      this.emit('stateChange', this.state);

      // Connection timeout (10 seconds)
      const connectionTimeout = setTimeout(() => {
        console.log('[Socket] Connection timeout');
        if (this.state === 'connecting') {
          this.state = 'error';
          this.emit('stateChange', this.state);
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
          reject(new Error('Connection timeout - make sure VSCode extension is running'));
        }
      }, 10000);

      try {
        let wsUrl = `${url}?token=${encodeURIComponent(token)}`;
        if (deviceName) {
          wsUrl += `&deviceName=${encodeURIComponent(deviceName)}`;
        }
        console.log('[Socket] Connecting to:', url);
        console.log('[Socket] Device name:', deviceName);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[Socket] WebSocket connected successfully!');
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.emit('stateChange', this.state);
          this.emit('connected');
          resolve();
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('[Socket] WebSocket closed', event.code, event.reason);
          this.handleDisconnect(event.wasClean);
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('[Socket] WebSocket error', error);
          if (this.state === 'connecting') {
            this.state = 'error';
            this.emit('stateChange', this.state);
            reject(new Error('Connection failed'));
          }
          this.emit('error', error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        clearTimeout(connectionTimeout);
        this.state = 'error';
        this.emit('stateChange', this.state);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS; // Prevent reconnection

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Reject all pending commands
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this.pendingCommands.delete(id);
    }

    this.state = 'disconnected';
    this.emit('stateChange', this.state);
    this.emit('disconnected');
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(wasClean: boolean): void {
    this.ws = null;
    this.state = 'disconnected';
    this.emit('stateChange', this.state);
    this.emit('disconnected');

    // Attempt reconnection if not clean close
    if (!wasClean && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = this.RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.url && this.token) {
        this.reconnectAttempts++;
        this.connect(this.url, this.token).catch((error) => {
          console.error('Reconnect failed', error);
        });
      }
    }, delay);
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as Message;

      if (message.type === 'response' || message.type === 'error') {
        const response = message as Response | ErrorResponse;
        const commandId = response.commandId;
        const pending = this.pendingCommands.get(commandId);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(commandId);

          if (message.type === 'response') {
            pending.resolve(message as Response);
          } else {
            const errorMsg = message as ErrorResponse;
            pending.reject(new Error(errorMsg.message || 'Unknown error'));
          }
        }
      }

      this.emit('message', message);

      if (message.type === 'event') {
        this.emit('event', message);
        // Also emit specific event type (e.g., 'ai:message', 'terminal:closed')
        const eventMessage = message as any;
        if (eventMessage.eventType) {
          console.log(`[Socket] EVENT RECEIVED: ${eventMessage.eventType}`, JSON.stringify(eventMessage.data).substring(0, 100));
          console.log(`[Socket] Emitting event: ${eventMessage.eventType}, listenerCount: ${this.listenerCount(eventMessage.eventType)}`);
          this.emit(eventMessage.eventType, eventMessage.data);
        } else {
          console.log(`[Socket] Event message without eventType:`, JSON.stringify(message).substring(0, 200));
        }

        // Check for accessToken in connected event (JWT for reconnection)
        if (eventMessage.data?.event === 'connected' && eventMessage.data?.accessToken) {
          console.log('[Socket] Received JWT for future reconnections, storing...');
          authService.storeTokens({
            accessToken: eventMessage.data.accessToken,
            refreshToken: eventMessage.data.accessToken, // Use same token as refresh
          }).catch((err) => console.error('[Socket] Failed to store JWT:', err));
        }
      }
    } catch (error) {
      console.error('Failed to parse message', error);
    }
  }

  /**
   * Send a command and wait for response
   */
  sendCommand<T = unknown>(
    category: string,
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.state !== 'connected' || !this.ws) {
        reject(new Error('Not connected'));
        return;
      }

      const id = this.generateMessageId();
      const command: Command = {
        type: 'command',
        id,
        timestamp: Date.now(),
        category: category as any,
        action,
        payload,
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error('Command timed out'));
      }, this.COMMAND_TIMEOUT_MS);

      // Store pending command
      this.pendingCommands.set(id, {
        resolve: (response: Response) => {
          resolve(response.data as T);
        },
        reject,
        timeout,
      });

      // Send command
      this.ws.send(JSON.stringify(command));
    });
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `cmd_${Date.now()}_${++this.messageIdCounter}`;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get current URL
   */
  getUrl(): string | null {
    return this.url;
  }

  /**
   * Get active connection type
   */
  getActiveConnectionType(): 'local' | 'relay' | null {
    return this.activeConnectionType;
  }

  /**
   * Set connection preference
   */
  setPreference(preference: ConnectionPreference): void {
    this.preference = preference;
  }

  /**
   * Get connection preference
   */
  getPreference(): ConnectionPreference {
    return this.preference;
  }

  /**
   * Connect with auto-detection (try local first, then relay)
   */
  async connectAuto(
    localAddress: string | undefined,
    relayUrl: string | undefined,
    token: string
  ): Promise<void> {
    // If preference is set to specific type, use it
    if (this.preference.type === 'local' && localAddress) {
      return this.connectLocal(localAddress, token);
    }
    if (this.preference.type === 'relay' && relayUrl) {
      return this.connectRelay(relayUrl, token);
    }

    // Auto mode: try local first
    if (localAddress) {
      try {
        await this.connectLocalWithTimeout(localAddress, token);
        return;
      } catch (error) {
        console.log('Local connection failed, trying relay...');
      }
    }

    // Fall back to relay
    if (relayUrl) {
      return this.connectRelay(relayUrl, token);
    }

    throw new Error('No connection method available');
  }

  /**
   * Connect to local WebSocket with timeout
   */
  private connectLocalWithTimeout(url: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        reject(new Error('Local connection timed out'));
      }, this.LOCAL_TIMEOUT_MS);

      this.connect(url, token)
        .then(() => {
          clearTimeout(timeout);
          this.activeConnectionType = 'local';
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Connect to local WebSocket directly
   */
  connectLocal(url: string, token: string): Promise<void> {
    return this.connect(url, token).then(() => {
      this.activeConnectionType = 'local';
    });
  }

  /**
   * Connect to relay server via Socket.IO
   */
  connectRelay(relayUrl: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === 'connected' || this.state === 'connecting') {
        this.disconnect();
      }

      this.url = relayUrl;
      this.token = token;
      this.state = 'connecting';
      this.emit('stateChange', this.state);

      try {
        this.socketIO = io(`${relayUrl}/device`, {
          path: '/relay',
          auth: {
            token,
            deviceType: 'mobile',
          },
          reconnection: true,
          reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: this.RECONNECT_DELAY_MS,
          timeout: 20000,
        });

        this.socketIO.on('connect', () => {
          console.log('Socket.IO connected to relay');
          this.state = 'connected';
          this.activeConnectionType = 'relay';
          this.reconnectAttempts = 0;
          this.emit('stateChange', this.state);
          this.emit('connected');
          resolve();
        });

        this.socketIO.on('disconnect', (reason) => {
          console.log('Socket.IO disconnected:', reason);
          this.handleRelayDisconnect(reason);
        });

        this.socketIO.on('connect_error', (error) => {
          console.error('Socket.IO connection error:', error);
          if (this.state === 'connecting') {
            this.state = 'error';
            this.emit('stateChange', this.state);
            reject(new Error('Relay connection failed'));
          }
        });

        // Handle responses from VSCode via relay
        this.socketIO.on('response', (response: Response | ErrorResponse) => {
          this.handleRelayResponse(response);
        });

        // Handle events from VSCode via relay
        this.socketIO.on('event', (event: Message) => {
          console.log(`[Socket] RELAY EVENT RECEIVED:`, JSON.stringify(event).substring(0, 150));
          this.emit('message', event);
          this.emit('event', event);
          // Also emit specific event type (e.g., 'ai:message', 'terminal:closed')
          const eventMessage = event as any;
          if (eventMessage.eventType) {
            console.log(`[Socket] RELAY Emitting: ${eventMessage.eventType}`, JSON.stringify(eventMessage.data).substring(0, 100));
            this.emit(eventMessage.eventType, eventMessage.data);
          }
        });

        // Handle device events
        this.socketIO.on('device:connected', (data) => {
          console.log('Device connected via relay:', data);
          this.emit('deviceConnected', data);
        });

        this.socketIO.on('device:disconnected', (data) => {
          console.log('Device disconnected from relay:', data);
          this.emit('deviceDisconnected', data);
        });

      } catch (error) {
        this.state = 'error';
        this.emit('stateChange', this.state);
        reject(error);
      }
    });
  }

  /**
   * Handle relay response
   */
  private handleRelayResponse(response: Response | ErrorResponse): void {
    const commandId = response.commandId;
    const pending = this.pendingCommands.get(commandId);

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingCommands.delete(commandId);

      if (response.type === 'response') {
        pending.resolve(response as Response);
      } else {
        const errorMsg = response as ErrorResponse;
        pending.reject(new Error(errorMsg.message || 'Unknown error'));
      }
    }

    this.emit('message', response);
  }

  /**
   * Handle relay disconnect
   */
  private handleRelayDisconnect(reason: string): void {
    this.socketIO = null;
    this.activeConnectionType = null;
    this.state = 'disconnected';
    this.emit('stateChange', this.state);
    this.emit('disconnected');
  }

  /**
   * Send command (works for both local and relay)
   */
  sendCommandUnified<T = unknown>(
    category: string,
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<T> {
    if (this.activeConnectionType === 'relay' && this.socketIO) {
      return this.sendCommandViaRelay<T>(category, action, payload);
    }
    return this.sendCommand<T>(category, action, payload);
  }

  /**
   * Send command via Socket.IO relay
   */
  private sendCommandViaRelay<T = unknown>(
    category: string,
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.state !== 'connected' || !this.socketIO) {
        reject(new Error('Not connected to relay'));
        return;
      }

      const id = this.generateMessageId();
      const command: Command = {
        type: 'command',
        id,
        timestamp: Date.now(),
        category: category as any,
        action,
        payload,
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error('Command timed out'));
      }, this.COMMAND_TIMEOUT_MS);

      // Store pending command
      this.pendingCommands.set(id, {
        resolve: (response: Response) => {
          resolve(response.data as T);
        },
        reject,
        timeout,
      });

      // Send command via Socket.IO
      this.socketIO.emit('command', command);
    });
  }

  /**
   * Disconnect (handles both local and relay)
   */
  disconnectAll(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS;

    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Close Socket.IO
    if (this.socketIO) {
      this.socketIO.disconnect();
      this.socketIO = null;
    }

    // Reject all pending commands
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this.pendingCommands.delete(id);
    }

    this.activeConnectionType = null;
    this.state = 'disconnected';
    this.emit('stateChange', this.state);
    this.emit('disconnected');
  }
}

export const socketService = SocketService.getInstance();
