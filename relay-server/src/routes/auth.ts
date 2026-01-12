import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { jwtService } from '../services/jwt';
import { pairingService, PairingSession, RegisteredDevice } from '../services/pairing';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { config } from '../config';

const router = Router();

/**
 * Error codes
 */
const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_PIN: 'INVALID_PIN',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ALREADY_PAIRED: 'ALREADY_PAIRED',
} as const;

/**
 * Request body for /pair/init
 */
interface PairInitRequest {
  workspaceId: string;
  workspaceName: string;
  localAddress?: string;
  relayUrl?: string;
  tokenHash: string;
  pin: string;
}

/**
 * Request body for /pair/complete
 */
interface PairCompleteRequest {
  token?: string;
  pin?: string;
  deviceName: string;
  platform: string;
  appVersion: string;
}

/**
 * Request body for /auth/refresh
 */
interface RefreshRequest {
  refreshToken: string;
}

/**
 * POST /pair/init
 * Called by VSCode extension to register a pairing session
 */
router.post('/pair/init', async (req: Request, res: Response) => {
  try {
    const body = req.body as PairInitRequest;

    // Validate required fields
    if (!body.workspaceId || !body.workspaceName || !body.tokenHash || !body.pin) {
      res.status(400).json({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Missing required fields: workspaceId, workspaceName, tokenHash, pin',
      });
      return;
    }

    // Create pairing session
    const session: PairingSession = {
      id: `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId: body.workspaceId,
      workspaceName: body.workspaceName,
      localAddress: body.localAddress,
      relayUrl: body.relayUrl,
      pin: body.pin,
      tokenHash: body.tokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + config.pairingTokenExpiry * 1000,
      status: 'pending',
    };

    await pairingService.storePairingSession(session);

    logger.info(`Pairing session ${session.id} created for workspace ${body.workspaceName}`);

    res.status(201).json({
      sessionId: session.id,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  } catch (error) {
    logger.error('Error in /pair/init', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create pairing session',
    });
  }
});

/**
 * POST /pair/complete
 * Called by mobile app to complete pairing with token or PIN
 */
router.post('/pair/complete', async (req: Request, res: Response) => {
  try {
    const body = req.body as PairCompleteRequest;

    // Validate required fields
    if (!body.deviceName || !body.platform || !body.appVersion) {
      res.status(400).json({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Missing required fields: deviceName, platform, appVersion',
      });
      return;
    }

    if (!body.token && !body.pin) {
      res.status(400).json({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Either token or pin is required',
      });
      return;
    }

    let session: PairingSession | null = null;

    // Find session by token or PIN
    if (body.token) {
      // Hash the token to match stored hash
      const tokenHash = createHash('sha256').update(body.token).digest('hex');
      session = await pairingService.getPairingSessionByTokenHash(tokenHash);

      if (!session) {
        res.status(401).json({
          code: ErrorCodes.INVALID_TOKEN,
          message: 'Invalid or expired pairing token',
        });
        return;
      }
    } else if (body.pin) {
      session = await pairingService.getPairingSessionByPin(body.pin);

      if (!session) {
        res.status(401).json({
          code: ErrorCodes.INVALID_PIN,
          message: 'Invalid or expired PIN',
        });
        return;
      }
    }

    if (!session) {
      res.status(404).json({
        code: ErrorCodes.SESSION_NOT_FOUND,
        message: 'Pairing session not found',
      });
      return;
    }

    // Check if session is expired
    if (Date.now() > session.expiresAt) {
      res.status(401).json({
        code: ErrorCodes.SESSION_EXPIRED,
        message: 'Pairing session has expired',
      });
      return;
    }

    // Check if already paired
    if (session.status === 'completed') {
      res.status(409).json({
        code: ErrorCodes.ALREADY_PAIRED,
        message: 'Pairing session has already been completed',
      });
      return;
    }

    // Generate device ID and register device
    const deviceId = pairingService.generateDeviceId();
    const device: RegisteredDevice = {
      id: deviceId,
      name: body.deviceName,
      platform: body.platform,
      appVersion: body.appVersion,
      workspaceId: session.workspaceId,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    await pairingService.registerDevice(device);

    // Generate tokens
    const { accessToken, refreshToken } = jwtService.generateTokenPair(
      deviceId,
      session.workspaceId,
      session.workspaceName
    );

    // Store refresh token for revocation tracking
    await pairingService.storeRefreshToken(refreshToken, deviceId);

    // Mark session as completed
    await pairingService.completePairingSession(session.id);

    logger.info(
      `Pairing completed: device ${body.deviceName} paired with workspace ${session.workspaceName}`
    );

    res.status(200).json({
      deviceId,
      accessToken,
      refreshToken,
      workspace: {
        id: session.workspaceId,
        name: session.workspaceName,
        localAddress: session.localAddress,
        relayUrl: session.relayUrl,
      },
    });
  } catch (error) {
    logger.error('Error in /pair/complete', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to complete pairing',
    });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post('/auth/refresh', async (req: Request, res: Response) => {
  try {
    const body = req.body as RefreshRequest;

    if (!body.refreshToken) {
      res.status(400).json({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Missing refreshToken',
      });
      return;
    }

    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(body.refreshToken);
    if (!decoded) {
      res.status(401).json({
        code: ErrorCodes.INVALID_TOKEN,
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    // Check if token is revoked
    const isValid = await pairingService.isRefreshTokenValid(body.refreshToken);
    if (!isValid) {
      res.status(401).json({
        code: ErrorCodes.INVALID_TOKEN,
        message: 'Refresh token has been revoked',
      });
      return;
    }

    // Get device for workspace name
    const device = await pairingService.getDevice(decoded.payload.deviceId);
    if (!device) {
      res.status(401).json({
        code: ErrorCodes.INVALID_TOKEN,
        message: 'Device not found',
      });
      return;
    }

    // Generate new token pair
    const { accessToken, refreshToken } = jwtService.generateTokenPair(
      decoded.payload.deviceId,
      decoded.payload.workspaceId,
      device.workspaceId // Will fetch workspace name from device context
    );

    // Revoke old refresh token and store new one
    await pairingService.revokeRefreshToken(body.refreshToken);
    await pairingService.storeRefreshToken(refreshToken, decoded.payload.deviceId);

    // Update device last seen
    await pairingService.updateDeviceLastSeen(decoded.payload.deviceId);

    logger.debug(`Refreshed tokens for device ${decoded.payload.deviceId}`);

    res.status(200).json({
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Error in /auth/refresh', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to refresh token',
    });
  }
});

/**
 * POST /auth/logout
 * Revoke refresh token
 */
router.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await pairingService.revokeRefreshToken(refreshToken);
    }

    logger.info(`Device ${req.auth?.deviceId} logged out`);

    res.status(200).json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Error in /auth/logout', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to logout',
    });
  }
});

/**
 * GET /auth/me
 * Get current device info
 */
router.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const device = await pairingService.getDevice(req.auth!.deviceId);

    if (!device) {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
      return;
    }

    res.status(200).json({
      deviceId: device.id,
      deviceName: device.name,
      platform: device.platform,
      workspaceId: device.workspaceId,
      lastSeenAt: new Date(device.lastSeenAt).toISOString(),
    });
  } catch (error) {
    logger.error('Error in /auth/me', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get device info',
    });
  }
});

export default router;
