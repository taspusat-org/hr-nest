import { Module } from '@nestjs/common';
import { LaporanCutiKaryawanService } from './laporan_cuti_karyawan.service';
import { LaporanCutiKaryawanController } from './laporan_cuti_karyawan.controller';

@Module({
  controllers: [LaporanCutiKaryawanController],
  providers: [LaporanCutiKaryawanService],
})
export class LaporanCutiKaryawanModule {}
