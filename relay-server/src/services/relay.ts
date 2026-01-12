import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { redis } from './redis';
import { jwtService } from './jwt';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Connected device information
 */
export interface ConnectedDevice {
  socketId: string;
  deviceId: string;
  deviceType: 'vscode' | 'mobile';
  workspaceId: string;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * Redis keys for relay service
 */
const KEYS = {
  DEVICE_ONLINE: 'relay:online:',
  WORKSPACE_DEVICES: 'relay:workspace:',
} as const;

/**
 * Relay service for message forwarding between VSCode and mobile
 */
export class RelayService {
  private static instance: RelayService;
  private io: SocketIOServer | null = null;
  private connectedDevices: Map<string, ConnectedDevice> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): RelayService {
    if (!RelayService.instance) {
      RelayService.instance = new RelayService();
    }
    return RelayService.instance;
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      path: '/relay',
    });

    // Device namespace for VSCode extensions and mobile apps
    const deviceNamespace = this.io.of('/device');

    deviceNamespace.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Allow demo-token in development mode
        if (config.nodeEnv === 'development' && token === 'demo-token') {
          logger.debug('Accepting demo-token in development mode');
          socket.data.deviceId = `dev-${socket.id}`;
          socket.data.workspaceId = socket.handshake.auth.workspaceId || 'dev-workspace';
          socket.data.deviceType = socket.handshake.auth.deviceType || 'vscode';
          return next();
        }

        const decoded = jwtService.verifyAccessToken(token);
        if (!decoded) {
          return next(new Error('Invalid token'));
        }

        // Attach device info to socket
        socket.data.deviceId = decoded.payload.deviceId;
        socket.data.workspaceId = decoded.payload.workspaceId;
        socket.data.deviceType = socket.handshake.auth.deviceType || 'mobile';

        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    deviceNamespace.on('connection', (socket) => this.handleConnection(socket));

    logger.info('Relay service initialized with Socket.IO');
  }

  /**
   * Handle new device connection
   */
  private handleConnection(socket: Socket): void {
    const { deviceId, workspaceId, deviceType } = socket.data;

    // Create device record
    const device: ConnectedDevice = {
      socketId: socket.id,
      deviceId,
      deviceType,
      workspaceId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    // Store connected device
    this.connectedDevices.set(socket.id, device);

    // Join workspace room
    const roomName = `workspace:${workspaceId}`;
    socket.join(roomName);

    // Update online status in Redis
    this.setDeviceOnline(deviceId, workspaceId, deviceType);

    logger.info(`Device connected: ${deviceType} ${deviceId} to workspace ${workspaceId}`);

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

    const { deviceId, workspaceId, deviceType } = device;

    // Remove from connected devices
    this.connectedDevices.delete(socket.id);

    // Update offline status in Redis
    this.setDeviceOffline(deviceId);

    logger.info(`Device disconnected: ${deviceType} ${deviceId} (${reason})`);

    // Notify workspace about device leaving
    const roomName = `workspace:${workspaceId}`;
    socket.to(roomName).emit('device:disconnected', {
      deviceId,
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
    if (!device || device.deviceType !== 'mobile') return;

    device.lastActivity = new Date();

    // Find VSCode extension in the same workspace
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('command', command);

    logger.debug(`Forwarded command from mobile to workspace ${device.workspaceId}`);
  }

  /**
   * Forward response from VSCode to mobile
   */
  private forwardResponse(socket: Socket, response: unknown): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device || device.deviceType !== 'vscode') return;

    device.lastActivity = new Date();

    // Broadcast response to mobile devices in workspace
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('response', response);

    logger.debug(`Forwarded response from VSCode to workspace ${device.workspaceId}`);
  }

  /**
   * Forward event from VSCode to mobile
   */
  private forwardEvent(socket: Socket, event: unknown): void {
    const device = this.connectedDevices.get(socket.id);
    if (!device || device.deviceType !== 'vscode') return;

    device.lastActivity = new Date();

    // Broadcast event to mobile devices in workspace
    const roomName = `workspace:${device.workspaceId}`;
    socket.to(roomName).emit('event', event);
  }

  /**
   * Set device online status in Redis
   */
  private async setDeviceOnline(
    deviceId: string,
    workspaceId: string,
    deviceType: string
  ): Promise<void> {
    const onlineData = {
      deviceId,
      workspaceId,
      deviceType,
      onlineAt: Date.now(),
    };

    // Store online status with TTL (5 minutes, renewed by heartbeat)
    await redis.setJson(`${KEYS.DEVICE_ONLINE}${deviceId}`, onlineData, 300);

    // Add to workspace device set
    await redis.sadd(`${KEYS.WORKSPACE_DEVICES}${workspaceId}`, deviceId);
  }

  /**
   * Set device offline status in Redis
   */
  private async setDeviceOffline(deviceId: string): Promise<void> {
    const onlineData = await redis.getJson<{ workspaceId: string }>(
      `${KEYS.DEVICE_ONLINE}${deviceId}`
    );

    if (onlineData?.workspaceId) {
      await redis.srem(`${KEYS.WORKSPACE_DEVICES}${onlineData.workspaceId}`, deviceId);
    }

    await redis.del(`${KEYS.DEVICE_ONLINE}${deviceId}`);
  }

  /**
   * Check if device is online
   */
  async isDeviceOnline(deviceId: string): Promise<boolean> {
    const exists = await redis.get(`${KEYS.DEVICE_ONLINE}${deviceId}`);
    return exists !== null;
  }

  /**
   * Get online devices for workspace
   */
  async getWorkspaceOnlineDevices(workspaceId: string): Promise<string[]> {
    return redis.smembers(`${KEYS.WORKSPACE_DEVICES}${workspaceId}`);
  }

  /**
   * Get connected device count
   */
  getConnectedDeviceCount(): number {
    return this.connectedDevices.size;
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
   * Check if Socket.IO is initialized
   */
  isInitialized(): boolean {
    return this.io !== null;
  }
}

export const relayService = RelayService.getInstance();
