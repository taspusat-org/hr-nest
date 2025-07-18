import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async set(key: string, value: string, ttl: number = 3600): Promise<string> {
    return this.redis.set(key, value, 'EX', ttl);
  }

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get(key);
    if (value !== null) {
      await this.redis.del(key);
    }
    return value;
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async flushAll(): Promise<string> {
    return this.redis.flushall();
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
}
