import * as SecureStore from 'expo-secure-store';
import { storage, STORAGE_KEYS } from './storage';

/**
 * Secure storage keys
 */
const SECURE_KEYS = {
  ACCESS_TOKEN: 'nzr_access_token',
  REFRESH_TOKEN: 'nzr_refresh_token',
} as const;

/**
 * Pairing result from QR code or PIN
 */
export interface PairingResult {
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  workspace: {
    id: string;
    name: string;
    localAddress?: string;
    relayUrl?: string;
  };
}

/**
 * Token pair
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * QR Code payload structure
 */
export interface QRCodePayload {
  t: string;      // token
  w: string;      // workspaceId
  n: string;      // workspaceName
  l?: string;     // localAddress
  r?: string;     // relayUrl
  e: number;      // expiresAt (timestamp)
  v: number;      // version
}

/**
 * Auth service for token management
 */
class AuthService {
  private relayBaseUrl: string;

  constructor() {
    // Default relay URL - should be configured
    this.relayBaseUrl = process.env.EXPO_PUBLIC_RELAY_URL || 'http://localhost:3001';
  }

  /**
   * Set relay base URL
   */
  setRelayUrl(url: string): void {
    this.relayBaseUrl = url;
  }

  /**
   * Parse QR code data
   */
  parseQRCode(data: string): QRCodePayload | null {
    try {
      const payload = JSON.parse(data) as QRCodePayload;

      // Validate required fields
      if (!payload.t || !payload.w || !payload.n || !payload.e || payload.v === undefined) {
        console.error('Invalid QR code payload: missing required fields');
        return null;
      }

      // Check expiration
      if (Date.now() > payload.e) {
        console.error('QR code has expired');
        return null;
      }

      return payload;
    } catch (error) {
      console.error('Failed to parse QR code:', error);
      return null;
    }
  }

  /**
   * Complete pairing with token (from QR code)
   */
  async completePairingWithToken(
    token: string,
    deviceInfo: {
      name: string;
      platform: string;
      appVersion: string;
    }
  ): Promise<PairingResult> {
    const response = await fetch(`${this.relayBaseUrl}/api/v1/pair/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        deviceName: deviceInfo.name,
        platform: deviceInfo.platform,
        appVersion: deviceInfo.appVersion,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to complete pairing');
    }

    const result = await response.json() as PairingResult;

    // Store tokens securely
    await this.storeTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    // Store device ID
    await storage.setItem(STORAGE_KEYS.DEVICE_ID, result.deviceId);

    return result;
  }

  /**
   * Complete pairing with PIN
   */
  async completePairingWithPin(
    pin: string,
    deviceInfo: {
      name: string;
      platform: string;
      appVersion: string;
    }
  ): Promise<PairingResult> {
    const response = await fetch(`${this.relayBaseUrl}/api/v1/pair/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pin,
        deviceName: deviceInfo.name,
        platform: deviceInfo.platform,
        appVersion: deviceInfo.appVersion,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to complete pairing');
    }

    const result = await response.json() as PairingResult;

    // Store tokens securely
    await this.storeTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    // Store device ID
    await storage.setItem(STORAGE_KEYS.DEVICE_ID, result.deviceId);

    return result;
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<TokenPair | null> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    try {
      const response = await fetch(`${this.relayBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Token invalid or expired
        await this.clearTokens();
        return null;
      }

      const tokens = await response.json() as TokenPair;

      // Store new tokens
      await this.storeTokens(tokens);

      return tokens;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  /**
   * Store tokens securely
   */
  async storeTokens(tokens: TokenPair): Promise<void> {
    await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }

  /**
   * Get access token
   */
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Clear all tokens
   */
  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN);
    await storage.removeItem(STORAGE_KEYS.DEVICE_ID);
  }

  /**
   * Check if authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    const refreshToken = await this.getRefreshToken();
    const accessToken = await this.getAccessToken();

    // Revoke token on server
    if (accessToken && refreshToken) {
      try {
        await fetch(`${this.relayBaseUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (error) {
        console.error('Failed to logout on server:', error);
      }
    }

    // Clear local tokens
    await this.clearTokens();
  }

  /**
   * Get device ID
   */
  async getDeviceId(): Promise<string | null> {
    return storage.getItem(STORAGE_KEYS.DEVICE_ID);
  }

  /**
   * Register push token for notifications
   */
  async registerPushToken(deviceId: string, pushToken: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.relayBaseUrl}/api/v1/notifications/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deviceId,
        token: pushToken,
        platform: 'ios', // TODO: Detect platform
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to register push token');
    }
  }
}

export const authService = new AuthService();
