import { Module } from '@nestjs/common';
import { ApprovaldetailService } from './approvaldetail.service';
import { ApprovaldetailController } from './approvaldetail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UtilsModule, LogtrailModule, AuthModule],
  controllers: [ApprovaldetailController],
  providers: [ApprovaldetailService],
  exports: [ApprovaldetailService],
})
export class ApprovaldetailModule {}
