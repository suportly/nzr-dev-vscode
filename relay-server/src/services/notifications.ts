import fetch from 'node-fetch';
import { logger } from '../utils/logger';
import { redisService } from './redis';

/**
 * Expo push notification message
 */
interface ExpoPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
}

/**
 * Expo push response
 */
interface ExpoPushTicket {
  id?: string;
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

/**
 * Notification types
 */
export type NotificationType =
  | 'diagnostic_error'
  | 'diagnostic_warning'
  | 'build_complete'
  | 'build_failed'
  | 'terminal_output'
  | 'file_changed'
  | 'connection_lost'
  | 'custom';

/**
 * Notification payload
 */
export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  workspaceId: string;
  deviceId?: string;
}

/**
 * Push token entry
 */
export interface PushTokenEntry {
  token: string;
  deviceId: string;
  platform: 'ios' | 'android';
  createdAt: string;
  updatedAt: string;
}

/**
 * Service for sending push notifications via Expo
 */
export class NotificationService {
  private static instance: NotificationService;
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  private readonly REDIS_KEY_PREFIX = 'push_tokens:';
  private readonly NOTIFICATION_HISTORY_KEY = 'notification_history:';

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Register push token for a device
   */
  async registerPushToken(
    deviceId: string,
    token: string,
    platform: 'ios' | 'android'
  ): Promise<void> {
    const entry: PushTokenEntry = {
      token,
      deviceId,
      platform,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await redisService.set(
      `${this.REDIS_KEY_PREFIX}${deviceId}`,
      JSON.stringify(entry),
      86400 * 30 // 30 days TTL
    );

    logger.info(`Registered push token for device: ${deviceId}`);
  }

  /**
   * Get push token for a device
   */
  async getPushToken(deviceId: string): Promise<PushTokenEntry | null> {
    const data = await redisService.get(`${this.REDIS_KEY_PREFIX}${deviceId}`);
    if (!data) return null;

    try {
      return JSON.parse(data) as PushTokenEntry;
    } catch {
      return null;
    }
  }

  /**
   * Remove push token for a device
   */
  async removePushToken(deviceId: string): Promise<void> {
    await redisService.del(`${this.REDIS_KEY_PREFIX}${deviceId}`);
    logger.info(`Removed push token for device: ${deviceId}`);
  }

  /**
   * Get all push tokens for devices in a workspace
   */
  async getWorkspaceTokens(workspaceId: string, deviceIds: string[]): Promise<PushTokenEntry[]> {
    const tokens: PushTokenEntry[] = [];

    for (const deviceId of deviceIds) {
      const entry = await this.getPushToken(deviceId);
      if (entry) {
        tokens.push(entry);
      }
    }

    return tokens;
  }

  /**
   * Send notification to a single device
   */
  async sendToDevice(
    deviceId: string,
    notification: NotificationPayload
  ): Promise<boolean> {
    const tokenEntry = await this.getPushToken(deviceId);
    if (!tokenEntry) {
      logger.warn(`No push token for device: ${deviceId}`);
      return false;
    }

    return this.sendPushNotification(tokenEntry.token, notification);
  }

  /**
   * Send notification to all devices in workspace
   */
  async sendToWorkspace(
    deviceIds: string[],
    notification: NotificationPayload
  ): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };

    for (const deviceId of deviceIds) {
      const success = await this.sendToDevice(deviceId, notification);
      if (success) {
        results.sent++;
      } else {
        results.failed++;
      }
    }

    // Store in notification history
    await this.storeNotification(notification);

    return results;
  }

  /**
   * Send push notification via Expo
   */
  private async sendPushNotification(
    token: string,
    notification: NotificationPayload
  ): Promise<boolean> {
    // Validate Expo push token format
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      logger.warn(`Invalid Expo push token format: ${token.substring(0, 20)}...`);
      return false;
    }

    const message: ExpoPushMessage = {
      to: token,
      title: notification.title,
      body: notification.body,
      sound: 'default',
      priority: this.getPriority(notification.type),
      data: {
        type: notification.type,
        workspaceId: notification.workspaceId,
        ...notification.data,
      },
    };

    try {
      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json() as { data: ExpoPushTicket[] };

      if (result.data && result.data.length > 0) {
        const ticket = result.data[0];
        if (ticket.status === 'ok') {
          logger.debug(`Push notification sent: ${ticket.id}`);
          return true;
        } else {
          logger.error(`Push notification failed: ${ticket.message}`);
          return false;
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to send push notification', error);
      return false;
    }
  }

  /**
   * Get notification priority based on type
   */
  private getPriority(type: NotificationType): 'default' | 'normal' | 'high' {
    switch (type) {
      case 'diagnostic_error':
      case 'build_failed':
      case 'connection_lost':
        return 'high';
      case 'diagnostic_warning':
      case 'build_complete':
        return 'normal';
      default:
        return 'default';
    }
  }

  /**
   * Store notification in history
   */
  private async storeNotification(notification: NotificationPayload): Promise<void> {
    const key = `${this.NOTIFICATION_HISTORY_KEY}${notification.workspaceId}`;
    const entry = {
      ...notification,
      sentAt: new Date().toISOString(),
    };

    // Store in Redis list (limited to last 100)
    await redisService.lpush(key, JSON.stringify(entry));
    await redisService.ltrim(key, 0, 99);
    await redisService.expire(key, 86400 * 7); // 7 days TTL
  }

  /**
   * Get notification history for workspace
   */
  async getNotificationHistory(
    workspaceId: string,
    limit: number = 20
  ): Promise<NotificationPayload[]> {
    const key = `${this.NOTIFICATION_HISTORY_KEY}${workspaceId}`;
    const items = await redisService.lrange(key, 0, limit - 1);

    return items.map((item) => {
      try {
        return JSON.parse(item) as NotificationPayload;
      } catch {
        return null;
      }
    }).filter((item): item is NotificationPayload => item !== null);
  }

  /**
   * Create diagnostic error notification
   */
  createDiagnosticNotification(
    workspaceId: string,
    file: string,
    errors: number,
    warnings: number
  ): NotificationPayload {
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
    if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);

    return {
      type: errors > 0 ? 'diagnostic_error' : 'diagnostic_warning',
      title: errors > 0 ? 'Build Errors' : 'Build Warnings',
      body: `${parts.join(', ')} in ${file}`,
      workspaceId,
      data: { file, errors, warnings },
    };
  }

  /**
   * Create build notification
   */
  createBuildNotification(
    workspaceId: string,
    success: boolean,
    duration?: number
  ): NotificationPayload {
    return {
      type: success ? 'build_complete' : 'build_failed',
      title: success ? 'Build Complete' : 'Build Failed',
      body: success
        ? `Build completed${duration ? ` in ${duration}ms` : ''}`
        : 'Build failed with errors',
      workspaceId,
      data: { success, duration },
    };
  }
}

export const notificationService = NotificationService.getInstance();
