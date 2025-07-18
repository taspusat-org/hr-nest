import { Module } from '@nestjs/common';
import { LaporanIzinKaryawanService } from './laporan_izin_karyawan.service';
import { LaporanIzinKaryawanController } from './laporan_izin_karyawan.controller';

@Module({
  controllers: [LaporanIzinKaryawanController],
  providers: [LaporanIzinKaryawanService],
})
export class LaporanIzinKaryawanModule {}
