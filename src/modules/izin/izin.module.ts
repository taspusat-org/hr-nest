import { Module } from '@nestjs/common';
import { IzinService } from './izin.service';
import { IzinController } from './izin.controller';

import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { CutiapprovalModule } from '../cutiapproval/cutiapproval.module';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { ApprovaldetailModule } from '../approvaldetail/approvaldetail.module';
import { IzinapprovalModule } from '../izinapproval/izinapproval.module';
import { MailModule } from 'src/common/mail/mail.module';

@Module({
  imports: [
    RedisModule,
    UtilsModule,
    AuthModule,
    LogtrailModule,
    IzinapprovalModule,
    KaryawanModule,
    ApprovaldetailModule,
    MailModule,
  ],
  controllers: [IzinController],
  providers: [IzinService],
  exports: [IzinService],
})
export class IzinModule {}
