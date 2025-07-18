import { Module } from '@nestjs/common';
import { RekapketerlambatanService } from './rekapketerlambatan.service';
import { RekapketerlambatanController } from './rekapketerlambatan.controller';

@Module({
  controllers: [RekapketerlambatanController],
  providers: [RekapketerlambatanService],
})
export class RekapketerlambatanModule {}
