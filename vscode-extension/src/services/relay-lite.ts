import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';
import { EventEmitter } from 'events';

/**
 * Connected device information
 */
export interface ConnectedDevice {
  socketId: string;
  deviceId: string;
  deviceType: 'vscode' | 'mobile';
  deviceName: string;
  workspaceId: string;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * Relay Lite - In-memory relay server for local and tunnel connections
 * No Redis required, runs embedded in the VSCode extension
 */
export class RelayLiteServer extends EventEmitter {
  private static instance: RelayLiteServer;
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;
  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private workspaceRooms: Map<string, Set<string>> = new Map();
  private logger: Logger;
  private config: Config;
  private isRunning = false;

  private constructor() {
    super();
    this.logger = new Logger('Relay Lite');
    this.config = Config.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): RelayLiteServer {
    if (!RelayLiteServer.instance) {
      RelayLiteServer.instance = new RelayLiteServer();
    }
    return RelayLiteServer.instance;
  }

  /**
   * Start the relay server
   */
  start(port?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        this.logger.warn('Relay Lite already running');
        resolve(this.getPort());
        return;
      }

      const relayPort = port || this.config.relayPort || 3004;

      try {
        // Create HTTP server
        this.httpServer = createServer((req, res) => {
          // Health check endpoint
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'ok',
              timestamp: new Date().toISOString(),
              connectedDevices: this.connectedDevices.size,
            }));
            return;
          }
          res.writeHead(404);
          res.end();
        });

        // Initialize Socket.IO
        this.io = new SocketIOServer(this.httpServer, {
          cors: {
            origin: '*',
            methods: ['GET', 'POST'],
          },
          path: '/relay',
          pingTimeout: 30000,
          pingInterval: 25000,
        });

        // Setup device namespace
        const deviceNamespace = this.io.of('/device');

        // Authentication middleware
        deviceNamespace.use((socket, next) => {
          const token = socket.handshake.auth.token;
          const workspaceId = socket.handshake.auth.workspaceId;

          if (!workspaceId) {
            return next(new Error('Workspace ID required'));
          }

          // For local relay, we accept any token (already authenticated via QR)
          // In production, you'd verify the token here
          socket.data.deviceId = socket.handshake.auth.deviceId || `device-${socket.id}`;
          socket.data.deviceName = socket.handshake.auth.deviceName || 'Unknown Device';
          socket.data.workspaceId = workspaceId;
          socket.data.deviceType = socket.handshake.auth.deviceType || 'mobile';

          this.logger.debug(`Auth passed for ${socket.data.deviceName} (${socket.data.deviceType})`);
          next();
        });

        // Handle connections
        deviceNamespace.on('connection', (socket) => this.handleConnection(socket));

        // Start listening
        this.httpServer.listen(relayPort, () => {
          this.isRunning = true;
          this.logger.info(`Relay Lite started on port ${relayPort}`);
          this.emit('started', relayPort);
          resolve(relayPort);
        });

        this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.warn(`Port ${relayPort} in use, trying ${relayPort + 1}`);
            this.httpServer?.close();
            this.start(relayPort + 1).then(resolve).catch(reject);
          } else {
            this.logger.error('Failed to start Relay Lite', error);
            reject(error);
          }
        });
      } catch (error) {
        this.logger.error('Failed to initialize Relay Lite', error as Error);
        reject(error);
      }
    });
  }

  /**
   * Stop the relay server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      this.logger.info('Stopping Relay Lite...');

      // Disconnect all clients
      this.io?.disconnectSockets(true);

      // Close Socket.IO
      this.io?.close(() => {
        this.io = null;
      });

      // Close HTTP server
      this.httpServer?.close(() => {
        this.httpServer = null;
        this.isRunning = false;
        this.connectedDevices.clear();
        this.workspaceRooms.clear();
        this.logger.info('Relay Lite stopped');
        this.emit('stopped');
        resolve();
      });

      // Force resolve after timeout
      setTimeout(() => {
        this.isRunning = false;
        resolve();
      }, 3000);
    });
  }

  /**
   * Handle new device connection
   */
  private handleConnection(socket: Socket): void {
    const { deviceId, deviceName, workspaceId, deviceType } = socket.data;

    // Create device record
    const device: ConnectedDevice = {
      socketId: socket.id,
      deviceId,
      deviceName,
      deviceType,
      workspaceId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    // Store connected device
    this.connectedDevices.set(socket.id, device);

    // Add to workspace room
    const roomName = `workspace:${workspaceId}`;
    socket.join(roomName);

    // Track workspace membership
    if (!this.workspaceRooms.has(workspaceId)) {
      this.workspaceRooms.set(workspaceId, new Set());
    }
    this.workspaceRooms.get(workspaceId)!.add(socket.id);

    this.logger.info(`Device connected: ${deviceName} (${deviceType}) to workspace`);
    this.emit('deviceConnected', device);

    // Handle message forwarding
    socket.on('message', (message) => this.handleMessage(socket, message));

    // Handle command forwarding (mobile → vscode)
    socket.on('command', (command) => this.forwardCommand(socket, command));

    // Handle response forwarding (vscode → mobile)
    socket.on('response', (response) => this.forwardResponse(socket, response));

    // Handle event forwarding (vscode → mobile)
    socket.on('event', (event) => this.forwardEvent(socket, event));

    // Handle ping for keepalive
    socket.on('ping', () => {
      device.lastActivity = new Date();
      socket.emit('pong');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });

    // Notify workspace about new device
    socket.to(roomName).emit('device:connected', {
      deviceId,
      deviceName,
      deviceType,
      timestamp: Date.now(),
    });

    // Send connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      workspaceId,
      roomName,
    });
  }

  /**
   * Handle device disconnection
   */
  private handleDisconnect(socket: Socket, reason: string): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device) return;

    const { deviceId, deviceName, workspaceId, deviceType } = device;

    // Remove from connected devices
    this.connectedDevices.delete(socket.id);

    // Remove from workspace room tracking
    this.workspaceRooms.get(workspaceId)?.delete(socket.id);
    if (this.workspaceRooms.get(workspaceId)?.size === 0) {
      this.workspaceRooms.delete(workspaceId);
    }

    this.logger.info(`Device disconnected: ${deviceName} (${reason})`);
    this.emit('deviceDisconnected', device, reason);

    // Notify workspace about device leaving
    const roomName = `workspace:${workspaceId}`;
    socket.to(roomName).emit('device:disconnected', {
      deviceId,
      deviceName,
      deviceType,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle generic message
   */
  private handleMessage(socket: Socket, message: unknown): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device) return;

    device.lastActivity = new Date();

    // Broadcast to workspace room (excluding sender)
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('message', message);
  }

  /**
   * Forward command from mobile to VSCode
   */
  private forwardCommand(socket: Socket, command: unknown): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device) return;

    device.lastActivity = new Date();

    // Forward to all devices in workspace (VSCode will handle it)
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('command', command);

    this.logger.debug(`Forwarded command from ${device.deviceName}`);
    this.emit('command', device, command);
  }

  /**
   * Forward response from VSCode to mobile
   */
  private forwardResponse(socket: Socket, response: unknown): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device) return;

    device.lastActivity = new Date();

    // Broadcast response to devices in workspace
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('response', response);

    this.logger.debug(`Forwarded response from ${device.deviceName}`);
  }

  /**
   * Forward event from VSCode to mobile
   */
  private forwardEvent(socket: Socket, event: unknown): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device) return;

    device.lastActivity = new Date();

    // Broadcast event to devices in workspace
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('event', event);
  }

  /**
   * Get connected device count
   */
  getConnectedDeviceCount(): number {
    return this.connectedDevices.size;
  }

  /**
   * Get all connected devices
   */
  getConnectedDevices(): ConnectedDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  /**
   * Get devices in a workspace
   */
  getWorkspaceDevices(workspaceId: string): ConnectedDevice[] {
    return Array.from(this.connectedDevices.values()).filter(
      (d) => d.workspaceId === workspaceId
    );
  }

  /**
   * Get mobile devices count
   */
  getMobileDeviceCount(): number {
    return Array.from(this.connectedDevices.values()).filter(
      (d) => d.deviceType === 'mobile'
    ).length;
  }

  /**
   * Check if server is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current port
   */
  getPort(): number {
    const address = this.httpServer?.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return 0;
  }

  /**
   * Get Socket.IO server instance (for internal use)
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

export const relayLite = RelayLiteServer.getInstance();
