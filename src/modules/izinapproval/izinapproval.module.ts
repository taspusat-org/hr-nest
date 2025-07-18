import { forwardRef, Module } from '@nestjs/common';
import { IzinapprovalService } from './izinapproval.service';
import { IzinapprovalController } from './izinapproval.controller';
import { MailModule } from 'src/common/mail/mail.module';
import { KaryawanModule } from '../karyawan/karyawan.module';

@Module({
  imports: [MailModule, KaryawanModule],
  controllers: [IzinapprovalController],
  providers: [IzinapprovalService],
  exports: [IzinapprovalService],
})
export class IzinapprovalModule {}
