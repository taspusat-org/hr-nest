import { Module } from '@nestjs/common';
import { ApprovalheaderService } from './approvalheader.service';
import { ApprovalheaderController } from './approvalheader.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UtilsModule, LogtrailModule, RedisModule, AuthModule],
  controllers: [ApprovalheaderController],
  providers: [ApprovalheaderService],
})
export class ApprovalheaderModule {}
