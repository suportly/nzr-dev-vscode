import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';
import { verifyJwt, signJwt, TokenPayload, generateDeviceId } from '../utils/auth';
import { PairingService } from '../services/pairing';
import { Message, Command, Response, ErrorResponse } from '@nzr-dev/shared';

/**
 * Connected client information
 */
export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  deviceId: string;
  deviceName: string;
  workspaceId: string;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * WebSocket server events
 */
export interface WebSocketServerEvents {
  clientConnected: (client: ConnectedClient) => void;
  clientDisconnected: (clientId: string) => void;
  message: (client: ConnectedClient, message: Message) => void;
  command: (client: ConnectedClient, command: Command) => void;
  error: (error: Error) => void;
}

/**
 * WebSocket server for mobile app connections
 */
export class WebSocketServerManager extends EventEmitter {
  private static instance: WebSocketServerManager;
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private logger: Logger;
  private config: Config;

  private constructor() {
    super();
    this.logger = new Logger('NZR WebSocket');
    this.config = Config.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WebSocketServerManager {
    if (!WebSocketServerManager.instance) {
      WebSocketServerManager.instance = new WebSocketServerManager();
    }
    return WebSocketServerManager.instance;
  }

  /**
   * Start the WebSocket server
   */
  start(): void {
    if (this.wss) {
      this.logger.warn('WebSocket server already running');
      return;
    }

    const port = this.config.localPort;

    // Create HTTP server
    this.httpServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'nzr-dev-plugin' }));
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (error) => this.handleServerError(error));

    this.httpServer.listen(port, () => {
      this.logger.info(`WebSocket server started on port ${port}`);
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    // Close all client connections
    for (const [clientId, client] of this.clients) {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch {
        // Ignore close errors
      }
      this.clients.delete(clientId);
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }

    this.logger.info('WebSocket server stopped');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    this.logger.info('New WebSocket connection attempt');
    const url = new URL(req.url || '/', `http://localhost`);
    const token = url.searchParams.get('token');
    const deviceNameParam = url.searchParams.get('deviceName');
    this.logger.debug(`Token received: ${token ? token.substring(0, 10) + '...' : 'none'}`);
    this.logger.debug(`Device name from URL: ${deviceNameParam || 'not provided'}`);

    // Validate token
    if (!token) {
      this.logger.warn('Connection rejected: missing token');
      ws.close(4001, 'Authentication required');
      return;
    }

    const payload = this.validateToken(token, deviceNameParam || undefined);
    this.logger.debug(`Token validation result: ${payload ? 'valid' : 'invalid'}`);
    if (!payload) {
      this.logger.warn('Connection rejected: invalid token');
      ws.close(4002, 'Invalid token');
      return;
    }
    this.logger.info(`Token validated for workspace: ${payload.workspaceId}`);

    // Create client record
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const client: ConnectedClient = {
      id: clientId,
      ws,
      deviceId: payload.deviceId || 'unknown',
      deviceName: payload.deviceName || 'Unknown Device',
      workspaceId: payload.workspaceId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.clients.set(clientId, client);
    this.logger.info(`Client connected: ${client.deviceName} (${clientId})`);

    // Set up event handlers
    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('close', (code, reason) => {
      this.logger.info(`WebSocket close event: code=${code}, reason=${reason?.toString() || 'none'}`);
      this.handleDisconnect(clientId);
    });
    ws.on('error', (error) => this.handleClientError(clientId, error));

    // Generate JWT for reconnection if this was a pairing token
    let accessToken: string | undefined;
    if (payload.type === 'pairing') {
      const jwtPayload: TokenPayload = {
        deviceId: client.deviceId,
        deviceName: client.deviceName,
        workspaceId: client.workspaceId,
        type: 'access',
      };
      // JWT expires in 30 days
      accessToken = signJwt(jwtPayload, this.config.jwtSecret, 30 * 24 * 60 * 60);
      this.logger.info(`Generated JWT for device ${client.deviceName}`);
    }

    // Send welcome message with JWT if newly paired
    this.logger.debug(`Sending welcome message to client ${clientId}`);
    this.sendToClient(client, {
      type: 'event',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      category: 'state',
      data: {
        event: 'connected',
        clientId,
        workspaceId: client.workspaceId,
        accessToken, // JWT for future reconnections
      },
    } as Message);
    this.logger.debug('Welcome message sent');

    // Emit event
    this.emit('clientConnected', client);
  }

  /**
   * Validate token (supports both pairing tokens and JWT)
   */
  private validateToken(token: string, deviceName?: string): TokenPayload | null {
    // First, try to validate as a pairing token
    this.logger.debug('Checking for pairing token...');
    const pairingService = PairingService.getInstance();
    this.logger.debug(`Active pairing sessions: ${pairingService.getActiveSessionCount()}`);
    const pairingSession = pairingService.validateToken(token);

    if (pairingSession) {
      this.logger.info(`Valid pairing token for session ${pairingSession.id}`);

      // Generate a device ID for this new connection
      const deviceId = generateDeviceId();

      // Use provided device name or default
      const finalDeviceName = deviceName || 'Mobile Device';

      // Complete the pairing session
      pairingService.completePairing(pairingSession.id, deviceId, finalDeviceName);

      // Return a TokenPayload for the new device
      return {
        deviceId,
        deviceName: finalDeviceName,
        workspaceId: pairingSession.qrPayload.w,
        type: 'pairing',
      };
    }

    // Fall back to JWT validation for already-paired devices
    try {
      return verifyJwt(token, this.config.jwtSecret);
    } catch (error) {
      this.logger.debug('Token validation failed', error as Error);
      return null;
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(client: ConnectedClient, data: Buffer | ArrayBuffer | Buffer[]): void {
    client.lastActivity = new Date();

    try {
      const message = JSON.parse(data.toString()) as Message;

      // Validate message structure
      if (!message.type || !message.id) {
        this.sendError(client, 'INVALID_MESSAGE', 'Invalid message structure');
        return;
      }

      this.logger.debug(`Received message from ${client.deviceName}: ${message.type}`);

      // Emit based on message type
      if (message.type === 'command') {
        this.emit('command', client, message as Command);
      }
      this.emit('message', client, message);

    } catch (error) {
      this.logger.error('Failed to parse message', error as Error);
      this.sendError(client, 'PARSE_ERROR', 'Failed to parse message');
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.logger.info(`Client disconnected: ${client.deviceName} (${clientId})`);
      this.clients.delete(clientId);
      this.emit('clientDisconnected', clientId);
    }
  }

  /**
   * Handle client error
   */
  private handleClientError(clientId: string, error: Error): void {
    this.logger.error(`Client error (${clientId})`, error);
    this.emit('error', error);
  }

  /**
   * Handle server error
   */
  private handleServerError(error: Error): void {
    this.logger.error('WebSocket server error', error);
    this.emit('error', error);
  }

  /**
   * Send message to a specific client
   */
  sendToClient(client: ConnectedClient, message: Message): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send response to a command
   */
  sendResponse(client: ConnectedClient, commandId: string, data: unknown): void {
    const response: Response = {
      type: 'response',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      commandId,
      success: true,
      data,
    };
    this.sendToClient(client, response);
  }

  /**
   * Send error response
   */
  sendError(client: ConnectedClient, code: string, message: string, commandId?: string): void {
    const errorResponse: ErrorResponse = {
      type: 'error',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      commandId: commandId || '',
      code,
      message,
    };
    this.sendToClient(client, errorResponse);
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: Message): void {
    const clientCount = this.clients.size;
    this.logger.debug(`[BROADCAST] Sending to ${clientCount} clients: ${JSON.stringify(message).substring(0, 150)}`);
    for (const client of this.clients.values()) {
      this.logger.debug(`[BROADCAST] Sending to client ${client.id} (${client.deviceName})`);
      this.sendToClient(client, message);
    }
  }

  /**
   * Get all connected clients
   */
  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.wss !== null;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const wsServer = WebSocketServerManager.getInstance();
