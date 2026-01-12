import { Request, Response, NextFunction } from 'express';
import { jwtService, AccessTokenPayload } from '../services/jwt';
import { logger } from '../utils/logger';

/**
 * Extended request interface with auth data
 */
export interface AuthenticatedRequest extends Request {
  auth?: {
    deviceId: string;
    workspaceId: string;
    workspaceName: string;
  };
}

/**
 * API error codes
 */
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MISSING_TOKEN: 'MISSING_TOKEN',
} as const;

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * JWT authentication middleware
 * Validates access token and attaches auth info to request
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    logger.debug('Missing authorization token');
    res.status(401).json({
      code: ErrorCodes.MISSING_TOKEN,
      message: 'Authorization token is required',
    });
    return;
  }

  const decoded = jwtService.verifyAccessToken(token);

  if (!decoded) {
    logger.debug('Invalid or expired access token');
    res.status(401).json({
      code: ErrorCodes.INVALID_TOKEN,
      message: 'Invalid or expired access token',
    });
    return;
  }

  // Attach auth info to request
  req.auth = {
    deviceId: decoded.payload.deviceId,
    workspaceId: decoded.payload.workspaceId,
    workspaceName: decoded.payload.workspaceName,
  };

  logger.debug(`Authenticated request from device ${req.auth.deviceId}`);
  next();
}

/**
 * Optional authentication middleware
 * Attaches auth info if token is valid, but doesn't require it
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req.headers.authorization);

  if (token) {
    const decoded = jwtService.verifyAccessToken(token);
    if (decoded) {
      req.auth = {
        deviceId: decoded.payload.deviceId,
        workspaceId: decoded.payload.workspaceId,
        workspaceName: decoded.payload.workspaceName,
      };
    }
  }

  next();
}

/**
 * Workspace validation middleware
 * Ensures authenticated user has access to the requested workspace
 */
export function requireWorkspaceAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const workspaceId = req.params.workspaceId || req.body?.workspaceId;

  if (!req.auth) {
    res.status(401).json({
      code: ErrorCodes.UNAUTHORIZED,
      message: 'Authentication required',
    });
    return;
  }

  if (workspaceId && req.auth.workspaceId !== workspaceId) {
    logger.warn(
      `Device ${req.auth.deviceId} attempted to access workspace ${workspaceId} but has access to ${req.auth.workspaceId}`
    );
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Access to this workspace is not permitted',
    });
    return;
  }

  next();
}
