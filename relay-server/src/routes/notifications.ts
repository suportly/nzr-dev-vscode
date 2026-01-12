import { Router, Request, Response } from 'express';
import { notificationService, NotificationPayload, NotificationType } from '../services/notifications';
import { requireAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
const router = Router();

/**
 * POST /notifications/send
 * Send notification to devices in workspace
 */
router.post('/send', requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, title, body, data, deviceIds } = req.body as {
      type: NotificationType;
      title: string;
      body: string;
      data?: Record<string, unknown>;
      deviceIds?: string[];
    };
    const workspaceId = req.body.workspaceId || (req as any).workspaceId;

    if (!type || !title || !body) {
      return res.status(400).json({
        error: 'Missing required fields: type, title, body',
      });
    }

    const notification: NotificationPayload = {
      type,
      title,
      body,
      data,
      workspaceId,
    };

    if (deviceIds && deviceIds.length > 0) {
      // Send to specific devices
      const results = await notificationService.sendToWorkspace(deviceIds, notification);
      return res.json({
        success: true,
        sent: results.sent,
        failed: results.failed,
      });
    } else {
      return res.status(400).json({
        error: 'deviceIds array is required',
      });
    }
  } catch (error) {
    logger.error('Failed to send notification', error);
    return res.status(500).json({
      error: 'Failed to send notification',
    });
  }
});

/**
 * POST /notifications/token
 * Register push token for device
 */
router.post('/token', requireAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId, token, platform } = req.body as {
      deviceId: string;
      token: string;
      platform: 'ios' | 'android';
    };

    if (!deviceId || !token || !platform) {
      return res.status(400).json({
        error: 'Missing required fields: deviceId, token, platform',
      });
    }

    await notificationService.registerPushToken(deviceId, token, platform);

    return res.json({
      success: true,
      message: 'Push token registered',
    });
  } catch (error) {
    logger.error('Failed to register push token', error);
    return res.status(500).json({
      error: 'Failed to register push token',
    });
  }
});

/**
 * DELETE /notifications/token/:deviceId
 * Remove push token for device
 */
router.delete('/token/:deviceId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    await notificationService.removePushToken(deviceId);

    return res.json({
      success: true,
      message: 'Push token removed',
    });
  } catch (error) {
    logger.error('Failed to remove push token', error);
    return res.status(500).json({
      error: 'Failed to remove push token',
    });
  }
});

/**
 * GET /notifications/history/:workspaceId
 * Get notification history for workspace
 */
router.get('/history/:workspaceId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await notificationService.getNotificationHistory(workspaceId, limit);

    return res.json({
      notifications: history,
    });
  } catch (error) {
    logger.error('Failed to get notification history', error);
    return res.status(500).json({
      error: 'Failed to get notification history',
    });
  }
});

export default router;
