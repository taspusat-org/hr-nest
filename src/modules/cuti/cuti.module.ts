import { Module } from '@nestjs/common';
import { CutiService } from './cuti.service';
import { CutiController } from './cuti.controller';
import { RedisModule } from 'src/common/redis/redis.module';
import { UtilsModule } from 'src/utils/utils.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { CutidetailModule } from '../cutidetail/cutidetail.module';
import { AuthModule } from '../auth/auth.module';
import { ApprovaldetailModule } from '../approvaldetail/approvaldetail.module';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { CutiapprovalModule } from '../cutiapproval/cutiapproval.module';
import { KnexModule } from '../knex/knex.module';
import { MailModule } from 'src/common/mail/mail.module';
import { ParameterModule } from '../parameter/parameter.module';

@Module({
  imports: [
    RedisModule,
    UtilsModule,
    LogtrailModule,
    CutidetailModule,
    AuthModule,
    ApprovaldetailModule,
    KaryawanModule,
    MailModule,
    ParameterModule,
    CutiapprovalModule,
    KnexModule,
  ],
  controllers: [CutiController],
  providers: [CutiService],
  exports: [CutiService],
})
export class CutiModule {}
