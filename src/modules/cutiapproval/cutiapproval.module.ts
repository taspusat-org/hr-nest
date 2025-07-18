import { Module } from '@nestjs/common';
import { CutiapprovalService } from './cutiapproval.service';
import { CutiapprovalController } from './cutiapproval.controller';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { MailModule } from 'src/common/mail/mail.module';

@Module({
  imports: [KaryawanModule, MailModule],
  controllers: [CutiapprovalController],
  providers: [CutiapprovalService],
  exports: [CutiapprovalService],
})
export class CutiapprovalModule {}
