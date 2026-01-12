import { redis } from './redis';
import { logger } from '../utils/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Pairing session stored in Redis
 */
export interface PairingSession {
  id: string;
  workspaceId: string;
  workspaceName: string;
  localAddress?: string;
  relayUrl?: string;
  pin: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'completed' | 'expired';
}

/**
 * Registered device in Redis
 */
export interface RegisteredDevice {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
  workspaceId: string;
  createdAt: number;
  lastSeenAt: number;
}

/**
 * Redis key prefixes
 */
const KEYS = {
  PAIRING_SESSION: 'pairing:session:',
  PAIRING_PIN: 'pairing:pin:',
  PAIRING_TOKEN: 'pairing:token:',
  DEVICE: 'device:',
  WORKSPACE_DEVICES: 'workspace:devices:',
  REFRESH_TOKEN: 'refresh:token:',
} as const;

/**
 * Service for managing pairing sessions in Redis
 */
class PairingService {
  /**
   * Store a pairing session
   */
  async storePairingSession(session: PairingSession): Promise<void> {
    const ttl = config.pairingTokenExpiry;

    // Store session by ID
    await redis.setJson(
      `${KEYS.PAIRING_SESSION}${session.id}`,
      session,
      ttl
    );

    // Index by PIN for PIN-based pairing
    await redis.set(
      `${KEYS.PAIRING_PIN}${session.pin}`,
      session.id,
      ttl
    );

    // Index by token hash for token-based pairing
    await redis.set(
      `${KEYS.PAIRING_TOKEN}${session.tokenHash}`,
      session.id,
      ttl
    );

    logger.debug(`Stored pairing session ${session.id}`);
  }

  /**
   * Get pairing session by ID
   */
  async getPairingSession(sessionId: string): Promise<PairingSession | null> {
    return redis.getJson<PairingSession>(`${KEYS.PAIRING_SESSION}${sessionId}`);
  }

  /**
   * Get pairing session by PIN
   */
  async getPairingSessionByPin(pin: string): Promise<PairingSession | null> {
    const sessionId = await redis.get(`${KEYS.PAIRING_PIN}${pin}`);
    if (!sessionId) {
      return null;
    }
    return this.getPairingSession(sessionId);
  }

  /**
   * Get pairing session by token hash
   */
  async getPairingSessionByTokenHash(
    tokenHash: string
  ): Promise<PairingSession | null> {
    const sessionId = await redis.get(`${KEYS.PAIRING_TOKEN}${tokenHash}`);
    if (!sessionId) {
      return null;
    }
    return this.getPairingSession(sessionId);
  }

  /**
   * Mark pairing session as completed
   */
  async completePairingSession(sessionId: string): Promise<void> {
    const session = await this.getPairingSession(sessionId);
    if (!session) {
      logger.warn(`Cannot complete pairing: session ${sessionId} not found`);
      return;
    }

    session.status = 'completed';

    // Update with short TTL for cleanup
    await redis.setJson(`${KEYS.PAIRING_SESSION}${sessionId}`, session, 60);

    // Remove PIN and token indexes
    await redis.del(`${KEYS.PAIRING_PIN}${session.pin}`);
    await redis.del(`${KEYS.PAIRING_TOKEN}${session.tokenHash}`);

    logger.info(`Pairing session ${sessionId} completed`);
  }

  /**
   * Delete pairing session
   */
  async deletePairingSession(sessionId: string): Promise<void> {
    const session = await this.getPairingSession(sessionId);
    if (session) {
      await redis.del(`${KEYS.PAIRING_SESSION}${sessionId}`);
      await redis.del(`${KEYS.PAIRING_PIN}${session.pin}`);
      await redis.del(`${KEYS.PAIRING_TOKEN}${session.tokenHash}`);
    }
  }

  /**
   * Register a device
   */
  async registerDevice(device: RegisteredDevice): Promise<void> {
    // Store device
    await redis.setJson(`${KEYS.DEVICE}${device.id}`, device);

    // Add to workspace device set
    await redis.sadd(
      `${KEYS.WORKSPACE_DEVICES}${device.workspaceId}`,
      device.id
    );

    logger.info(
      `Registered device ${device.id} (${device.name}) for workspace ${device.workspaceId}`
    );
  }

  /**
   * Get device by ID
   */
  async getDevice(deviceId: string): Promise<RegisteredDevice | null> {
    return redis.getJson<RegisteredDevice>(`${KEYS.DEVICE}${deviceId}`);
  }

  /**
   * Update device last seen timestamp
   */
  async updateDeviceLastSeen(deviceId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (device) {
      device.lastSeenAt = Date.now();
      await redis.setJson(`${KEYS.DEVICE}${deviceId}`, device);
    }
  }

  /**
   * Get all devices for a workspace
   */
  async getWorkspaceDevices(workspaceId: string): Promise<RegisteredDevice[]> {
    const deviceIds = await redis.smembers(
      `${KEYS.WORKSPACE_DEVICES}${workspaceId}`
    );

    const devices: RegisteredDevice[] = [];
    for (const deviceId of deviceIds) {
      const device = await this.getDevice(deviceId);
      if (device) {
        devices.push(device);
      }
    }

    return devices;
  }

  /**
   * Remove device from workspace
   */
  async removeDevice(deviceId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (device) {
      await redis.del(`${KEYS.DEVICE}${deviceId}`);
      await redis.srem(
        `${KEYS.WORKSPACE_DEVICES}${device.workspaceId}`,
        deviceId
      );
      logger.info(`Removed device ${deviceId}`);
    }
  }

  /**
   * Store refresh token for revocation tracking
   */
  async storeRefreshToken(
    token: string,
    deviceId: string,
    ttl: number = config.refreshTokenExpiry
  ): Promise<void> {
    await redis.set(`${KEYS.REFRESH_TOKEN}${token}`, deviceId, ttl);
  }

  /**
   * Check if refresh token is valid (not revoked)
   */
  async isRefreshTokenValid(token: string): Promise<boolean> {
    const deviceId = await redis.get(`${KEYS.REFRESH_TOKEN}${token}`);
    return deviceId !== null;
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await redis.del(`${KEYS.REFRESH_TOKEN}${token}`);
  }

  /**
   * Generate a 6-digit PIN
   */
  generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate a unique device ID
   */
  generateDeviceId(): string {
    return uuidv4();
  }
}

export const pairingService = new PairingService();
