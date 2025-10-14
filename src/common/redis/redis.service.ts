import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async set(key: string, value: string, ttl: number = 3600): Promise<string> {
    return this.redis.set(key, value, 'EX', ttl);
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async flushAll(): Promise<string> {
    return this.redis.flushall();
  }

  /**
   * Scan keys matching pattern (more efficient than KEYS command)
   * Recommended for production use
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Get keys matching pattern (simple but can be slow on large datasets)
   * Use scanKeys() for production
   */
  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  /**
   * Delete multiple keys at once
   */
  async delMultiple(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.redis.del(...keys);
  }

  /**
   * Delete all keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    const keys = await this.scanKeys(pattern);
    if (keys.length === 0) return 0;
    return this.delMultiple(keys);
  }

  async setLockItem(
    key: string,
    value: string,
    ttl: number = 300,
  ): Promise<void> {
    await this.redis.set(key, value, 'EX', ttl);
  }

  async getLockItem(key: string): Promise<string | null> {
    const value = await this.redis.get(key);
    if (value !== null) {
      await this.redis.del(key);
    }
    return value;
  }

  async delLockItem(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * Set expiration on existing key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.redis.expire(key, seconds);
    return result === 1;
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }
}
