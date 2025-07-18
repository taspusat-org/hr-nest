import { PartialType } from '@nestjs/mapped-types';
import { CreateLaporanIzinKaryawanDto } from './create-laporan_izin_karyawan.dto';

export class UpdateLaporanIzinKaryawanDto extends PartialType(
  CreateLaporanIzinKaryawanDto,
) {}
