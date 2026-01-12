import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Server configuration loaded from environment variables
 */
export const config = {
  /** Node environment */
  nodeEnv: process.env.NODE_ENV || 'development',

  /** Server port */
  port: parseInt(process.env.PORT || '3004', 10),

  /** Redis connection URL */
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  /** JWT secret for access tokens */
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',

  /** JWT secret for refresh tokens */
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',

  /** Access token expiration (in seconds) */
  accessTokenExpiry: parseInt(process.env.ACCESS_TOKEN_EXPIRY || '86400', 10), // 24 hours

  /** Refresh token expiration (in seconds) */
  refreshTokenExpiry: parseInt(process.env.REFRESH_TOKEN_EXPIRY || '604800', 10), // 7 days

  /** Pairing token expiration (in seconds) */
  pairingTokenExpiry: parseInt(process.env.PAIRING_TOKEN_EXPIRY || '300', 10), // 5 minutes

  /** CORS allowed origins */
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],

  /** Expo access token for push notifications */
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',

  /** Rate limit: requests per window */
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  /** Rate limit: window size in minutes */
  rateLimitWindowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10),

  /** Whether to log requests in development */
  logRequests: process.env.LOG_REQUESTS === 'true',
} as const;

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (config.nodeEnv === 'production') {
    if (config.jwtSecret === 'dev-secret-change-in-production') {
      errors.push('JWT_SECRET must be set in production');
    }
    if (config.jwtRefreshSecret === 'dev-refresh-secret-change-in-production') {
      errors.push('JWT_REFRESH_SECRET must be set in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

// Validate on import in production
if (config.nodeEnv === 'production') {
  validateConfig();
}
