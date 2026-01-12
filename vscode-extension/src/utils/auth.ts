import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * Token payload structure
 */
export interface TokenPayload {
  deviceId: string;
  deviceName?: string;
  workspaceId: string;
  type: 'pairing' | 'access' | 'refresh';
  permissions?: string[];
}

/**
 * Pairing token data
 */
export interface PairingTokenData {
  token: string;
  tokenHash: string;
  pin: string;
  expiresAt: Date;
  workspaceId: string;
}

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate a 6-digit PIN code
 */
export function generatePin(): string {
  const pin = crypto.randomInt(0, 1000000);
  return pin.toString().padStart(6, '0');
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a token against its hash
 */
export function verifyTokenHash(token: string, hash: string): boolean {
  const computedHash = hashToken(token);
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
}

/**
 * Generate a complete pairing token with hash and PIN
 */
export function generatePairingToken(
  workspaceId: string,
  expirationMinutes: number = 5
): PairingTokenData {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const pin = generatePin();
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  return {
    token,
    tokenHash,
    pin,
    expiresAt,
    workspaceId,
  };
}

/**
 * Sign a JWT token
 */
export function signJwt(
  payload: TokenPayload,
  secret: string,
  expiresInSeconds: number
): string {
  return jwt.sign(
    {
      ...payload,
      jti: uuidv4(),
    },
    secret,
    {
      expiresIn: expiresInSeconds,
      algorithm: 'HS256',
    }
  );
}

/**
 * Verify and decode a JWT token
 */
export function verifyJwt(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as TokenPayload & jwt.JwtPayload;
    return {
      deviceId: decoded.deviceId,
      deviceName: decoded.deviceName,
      workspaceId: decoded.workspaceId,
      type: decoded.type,
      permissions: decoded.permissions,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a device ID
 */
export function generateDeviceId(): string {
  return uuidv4();
}

/**
 * QR code payload structure for pairing
 */
export interface QRCodePayload {
  /** Pairing token */
  t: string;
  /** Workspace ID */
  w: string;
  /** Workspace name */
  n: string;
  /** Local WebSocket address (if available) */
  l?: string;
  /** Relay server URL (if configured) */
  r?: string;
  /** Expiration timestamp (Unix ms) */
  e: number;
  /** Protocol version */
  v: number;
}

/** Current QR code protocol version */
export const QR_PROTOCOL_VERSION = 1;

/**
 * Create QR code payload
 */
export function createQRCodePayload(
  token: string,
  workspaceId: string,
  workspaceName: string,
  localAddress?: string,
  relayUrl?: string,
  expiresAt?: Date
): QRCodePayload {
  return {
    t: token,
    w: workspaceId,
    n: workspaceName,
    ...(localAddress && { l: localAddress }),
    ...(relayUrl && { r: relayUrl }),
    e: expiresAt?.getTime() || Date.now() + 5 * 60 * 1000,
    v: QR_PROTOCOL_VERSION,
  };
}

/**
 * Parse QR code payload
 */
export function parseQRCodePayload(data: string): QRCodePayload | null {
  try {
    return JSON.parse(data) as QRCodePayload;
  } catch {
    return null;
  }
}
