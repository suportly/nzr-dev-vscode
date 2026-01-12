import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Redis client singleton for session management and pub/sub
 */
class RedisService {
  private static instance: RedisService;
  private client: Redis | null = null;
  private subscriber: Redis | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    try {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', err);
      });

      // Create separate connection for pub/sub
      this.subscriber = this.client.duplicate();

      this.subscriber.on('connect', () => {
        logger.info('Redis subscriber connected');
      });

      // Verify connection
      await this.client.ping();
      logger.info('Redis connection verified');
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  /**
   * Get Redis client
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get Redis subscriber for pub/sub
   */
  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized. Call connect() first.');
    }
    return this.subscriber;
  }

  /**
   * Set a key with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    return this.getClient().del(key);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.getClient().exists(key);
    return result === 1;
  }

  /**
   * Set JSON object
   */
  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /**
   * Get JSON object
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.getClient().publish(channel, message);
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.getSubscriber();
    await subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  /**
   * Add members to a set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.getClient().sadd(key, ...members);
  }

  /**
   * Get all members of a set
   */
  async smembers(key: string): Promise<string[]> {
    return this.getClient().smembers(key);
  }

  /**
   * Remove members from a set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.getClient().srem(key, ...members);
  }

  /**
   * Push to list (left)
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.getClient().lpush(key, ...values);
  }

  /**
   * Trim list to range
   */
  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.getClient().ltrim(key, start, stop);
  }

  /**
   * Get range from list
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.getClient().lrange(key, start, stop);
  }

  /**
   * Set key expiration
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.getClient().expire(key, seconds);
    return result === 1;
  }

  /**
   * Close Redis connections
   */
  async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    logger.info('Redis connections closed');
  }
}

export const redisService = RedisService.getInstance();
export const redis = redisService;
