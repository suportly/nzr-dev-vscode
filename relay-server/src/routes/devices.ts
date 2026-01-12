import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { relayService } from '../services/relay';
import { pairingService } from '../services/pairing';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /devices
 * List all devices registered to the authenticated workspace
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId } = req.auth!;

    // Get registered devices from storage
    const devices = await pairingService.getWorkspaceDevices(workspaceId);

    // Check online status for each device
    const devicesWithStatus = await Promise.all(
      devices.map(async (device) => ({
        ...device,
        isOnline: await relayService.isDeviceOnline(device.id),
      }))
    );

    res.json({
      devices: devicesWithStatus,
      count: devicesWithStatus.length,
    });
  } catch (error) {
    logger.error('Error listing devices', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to list devices',
    });
  }
});

/**
 * GET /devices/online
 * List online devices in the workspace
 */
router.get('/online', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId } = req.auth!;

    // Get currently connected devices from relay service
    const connectedDevices = relayService.getWorkspaceDevices(workspaceId);

    const devices = connectedDevices.map((d) => ({
      deviceId: d.deviceId,
      deviceType: d.deviceType,
      connectedAt: d.connectedAt.toISOString(),
      lastActivity: d.lastActivity.toISOString(),
    }));

    res.json({
      devices,
      count: devices.length,
    });
  } catch (error) {
    logger.error('Error listing online devices', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to list online devices',
    });
  }
});

/**
 * GET /devices/:deviceId
 * Get device details
 */
router.get('/:deviceId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { workspaceId } = req.auth!;

    const device = await pairingService.getDevice(deviceId);

    if (!device) {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
      return;
    }

    // Verify device belongs to this workspace
    if (device.workspaceId !== workspaceId) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Access denied to this device',
      });
      return;
    }

    const isOnline = await relayService.isDeviceOnline(deviceId);

    res.json({
      ...device,
      isOnline,
    });
  } catch (error) {
    logger.error('Error getting device', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get device',
    });
  }
});

/**
 * DELETE /devices/:deviceId
 * Remove a device from the workspace
 */
router.delete('/:deviceId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { workspaceId } = req.auth!;

    const device = await pairingService.getDevice(deviceId);

    if (!device) {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
      return;
    }

    // Verify device belongs to this workspace
    if (device.workspaceId !== workspaceId) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Access denied to this device',
      });
      return;
    }

    await pairingService.removeDevice(deviceId);

    logger.info(`Device ${deviceId} removed from workspace ${workspaceId}`);

    res.json({
      message: 'Device removed successfully',
    });
  } catch (error) {
    logger.error('Error removing device', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to remove device',
    });
  }
});

/**
 * POST /devices/:deviceId/ping
 * Ping a device to check if it's responsive
 */
router.post('/:deviceId/ping', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    const isOnline = await relayService.isDeviceOnline(deviceId);

    res.json({
      deviceId,
      isOnline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error pinging device', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to ping device',
    });
  }
});

export default router;
