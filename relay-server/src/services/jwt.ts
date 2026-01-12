import jwt, { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Token types
 */
export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  PAIRING = 'pairing',
}

/**
 * Access token payload
 */
export interface AccessTokenPayload {
  type: TokenType.ACCESS;
  deviceId: string;
  workspaceId: string;
  workspaceName: string;
}

/**
 * Refresh token payload
 */
export interface RefreshTokenPayload {
  type: TokenType.REFRESH;
  deviceId: string;
  workspaceId: string;
}

/**
 * Pairing token payload
 */
export interface PairingTokenPayload {
  type: TokenType.PAIRING;
  workspaceId: string;
  workspaceName: string;
  localAddress?: string;
  relayUrl?: string;
}

/**
 * Decoded token with JWT metadata
 */
export interface DecodedToken<T> extends JwtPayload {
  payload: T;
}

/**
 * JWT service for token management
 */
class JwtService {
  /**
   * Get secret based on token type
   */
  private getSecret(type: TokenType): string {
    switch (type) {
      case TokenType.ACCESS:
      case TokenType.PAIRING:
        return config.jwtSecret;
      case TokenType.REFRESH:
        return config.jwtRefreshSecret;
      default:
        return config.jwtSecret;
    }
  }

  /**
   * Get expiry based on token type (in seconds)
   */
  private getExpiry(type: TokenType): number {
    switch (type) {
      case TokenType.ACCESS:
        return config.accessTokenExpiry;
      case TokenType.REFRESH:
        return config.refreshTokenExpiry;
      case TokenType.PAIRING:
        return config.pairingTokenExpiry;
      default:
        return config.accessTokenExpiry;
    }
  }

  /**
   * Sign an access token
   */
  signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
    const fullPayload: AccessTokenPayload = {
      ...payload,
      type: TokenType.ACCESS,
    };

    const options: SignOptions = {
      expiresIn: this.getExpiry(TokenType.ACCESS),
      algorithm: 'HS256',
    };

    return jwt.sign(
      { payload: fullPayload },
      this.getSecret(TokenType.ACCESS),
      options
    );
  }

  /**
   * Sign a refresh token
   */
  signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
    const fullPayload: RefreshTokenPayload = {
      ...payload,
      type: TokenType.REFRESH,
    };

    const options: SignOptions = {
      expiresIn: this.getExpiry(TokenType.REFRESH),
      algorithm: 'HS256',
    };

    return jwt.sign(
      { payload: fullPayload },
      this.getSecret(TokenType.REFRESH),
      options
    );
  }

  /**
   * Sign a pairing token
   */
  signPairingToken(payload: Omit<PairingTokenPayload, 'type'>): string {
    const fullPayload: PairingTokenPayload = {
      ...payload,
      type: TokenType.PAIRING,
    };

    const options: SignOptions = {
      expiresIn: this.getExpiry(TokenType.PAIRING),
      algorithm: 'HS256',
    };

    return jwt.sign(
      { payload: fullPayload },
      this.getSecret(TokenType.PAIRING),
      options
    );
  }

  /**
   * Verify an access token
   */
  verifyAccessToken(token: string): DecodedToken<AccessTokenPayload> | null {
    try {
      const options: VerifyOptions = {
        algorithms: ['HS256'],
      };

      const decoded = jwt.verify(
        token,
        this.getSecret(TokenType.ACCESS),
        options
      ) as DecodedToken<AccessTokenPayload>;

      if (decoded.payload?.type !== TokenType.ACCESS) {
        logger.warn('Token type mismatch: expected access token');
        return null;
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Verify a refresh token
   */
  verifyRefreshToken(token: string): DecodedToken<RefreshTokenPayload> | null {
    try {
      const options: VerifyOptions = {
        algorithms: ['HS256'],
      };

      const decoded = jwt.verify(
        token,
        this.getSecret(TokenType.REFRESH),
        options
      ) as DecodedToken<RefreshTokenPayload>;

      if (decoded.payload?.type !== TokenType.REFRESH) {
        logger.warn('Token type mismatch: expected refresh token');
        return null;
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid refresh token', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Verify a pairing token
   */
  verifyPairingToken(token: string): DecodedToken<PairingTokenPayload> | null {
    try {
      const options: VerifyOptions = {
        algorithms: ['HS256'],
      };

      const decoded = jwt.verify(
        token,
        this.getSecret(TokenType.PAIRING),
        options
      ) as DecodedToken<PairingTokenPayload>;

      if (decoded.payload?.type !== TokenType.PAIRING) {
        logger.warn('Token type mismatch: expected pairing token');
        return null;
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Pairing token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid pairing token', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Decode a token without verification (for debugging)
   */
  decode(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload | null;
    } catch {
      return null;
    }
  }

  /**
   * Generate token pair for authenticated device
   */
  generateTokenPair(
    deviceId: string,
    workspaceId: string,
    workspaceName: string
  ): { accessToken: string; refreshToken: string } {
    const accessToken = this.signAccessToken({
      deviceId,
      workspaceId,
      workspaceName,
    });

    const refreshToken = this.signRefreshToken({
      deviceId,
      workspaceId,
    });

    return { accessToken, refreshToken };
  }
}

export const jwtService = new JwtService();
