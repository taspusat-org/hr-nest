import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { Redis } from 'ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisController } from './redis.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [RedisController],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        const redis = new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD', ''),
          db: configService.get<number>('REDIS_DB', 0),
        });
        return redis;
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService, 'REDIS_CLIENT'],
})
export class RedisModule {}
