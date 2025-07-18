import { Module } from '@nestjs/common';
import { RekapKehadiranService } from './rekap-kehadiran.service';
import { RekapKehadiranController } from './rekap-kehadiran.controller';

@Module({
  controllers: [RekapKehadiranController],
  providers: [RekapKehadiranService],
})
export class RekapKehadiranModule {}
