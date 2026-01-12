import { Request, Response, NextFunction } from 'express';
import { redisService } from '../services/redis';
import { logger } from '../utils/logger';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
  keyPrefix?: string;    // Redis key prefix
  message?: string;      // Custom error message
  skipFailedRequests?: boolean; // Don't count failed requests
  skip?: (req: Request) => boolean; // Custom skip function
}

/**
 * Default rate limit configurations
 */
export const RateLimitPresets = {
  // General API rate limit
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'rl:api:',
  },
  // Auth endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    keyPrefix: 'rl:auth:',
    message: 'Too many authentication attempts, please try again later',
  },
  // Pairing endpoints (very strict)
  pairing: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    keyPrefix: 'rl:pair:',
    message: 'Too many pairing attempts, please try again later',
  },
  // Notification sending
  notifications: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    keyPrefix: 'rl:notify:',
    message: 'Too many notifications, please slow down',
  },
};

/**
 * Get client identifier for rate limiting
 */
function getClientKey(req: Request): string {
  // Try to get device ID from auth token
  const deviceId = (req as any).deviceId;
  if (deviceId) {
    return deviceId;
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyPrefix = 'rl:',
    message = 'Too many requests, please try again later',
    skipFailedRequests = false,
    skip,
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if should skip
    if (skip && skip(req)) {
      return next();
    }

    const clientKey = getClientKey(req);
    const redisKey = `${keyPrefix}${clientKey}`;

    try {
      // Get current count
      const currentCount = await redisService.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      // Check if limit exceeded
      if (count >= maxRequests) {
        logger.warn(`Rate limit exceeded for ${clientKey} on ${req.path}`);

        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000).toString());

        return res.status(429).json({
          error: 'RATE_LIMITED',
          message,
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      // Increment counter
      if (count === 0) {
        // First request in window
        await redisService.set(redisKey, '1', Math.ceil(windowMs / 1000));
      } else {
        // Increment existing counter
        await redisService.getClient().incr(redisKey);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count - 1).toString());

      // Track response for skipFailedRequests
      if (skipFailedRequests) {
        const originalEnd = res.end;
        res.end = function (...args: any[]) {
          // If response failed, decrement counter
          if (res.statusCode >= 400) {
            redisService.getClient().decr(redisKey).catch(() => {});
          }
          return originalEnd.apply(res, args as Parameters<typeof originalEnd>);
        } as typeof res.end;
      }

      next();
    } catch (error) {
      // If Redis fails, allow the request but log the error
      logger.error('Rate limit check failed', error);
      next();
    }
  };
}

/**
 * Rate limit by specific key (e.g., by user ID, by endpoint)
 */
export function rateLimitByKey(
  config: RateLimitConfig,
  keyExtractor: (req: Request) => string
) {
  const middleware = rateLimit(config);

  return (req: Request, res: Response, next: NextFunction) => {
    // Override the key extraction
    const originalIp = req.ip;
    (req as any).ip = keyExtractor(req);

    middleware(req, res, () => {
      (req as any).ip = originalIp;
      next();
    });
  };
}

/**
 * Sliding window rate limiter (more accurate but uses more Redis operations)
 */
export function slidingWindowRateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix = 'rlsw:', message } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientKey = getClientKey(req);
    const redisKey = `${keyPrefix}${clientKey}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const client = redisService.getClient();

      // Remove old entries
      await client.zremrangebyscore(redisKey, 0, windowStart);

      // Count current entries
      const count = await client.zcard(redisKey);

      if (count >= maxRequests) {
        logger.warn(`Sliding window rate limit exceeded for ${clientKey}`);

        return res.status(429).json({
          error: 'RATE_LIMITED',
          message: message || 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      // Add current request
      await client.zadd(redisKey, now, `${now}-${Math.random()}`);
      await client.expire(redisKey, Math.ceil(windowMs / 1000));

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count - 1).toString());

      next();
    } catch (error) {
      logger.error('Sliding window rate limit check failed', error);
      next();
    }
  };
}

export default rateLimit;
