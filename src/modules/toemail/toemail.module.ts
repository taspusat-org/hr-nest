import { Module } from '@nestjs/common';
import { ToemailService } from './toemail.service';
import { ToemailController } from './toemail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [ToemailController],
  providers: [ToemailService],
})
export class ToemailModule {}
