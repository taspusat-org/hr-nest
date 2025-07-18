import { Module } from '@nestjs/common';
import { RedisModule } from 'src/common/redis/redis.module';
import { CcemailService } from './ccemail.service';
import { CcemailController } from './ccemail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';

@Module({
  imports: [RedisModule, UtilsModule, AuthModule, LogtrailModule],
  controllers: [CcemailController],
  providers: [CcemailService],
})
export class CcemailModule {}
