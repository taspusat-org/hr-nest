import { PartialType } from '@nestjs/mapped-types';
import { CreateLaporanCutiKaryawanDto } from './create-laporan_cuti_karyawan.dto';

export class UpdateLaporanCutiKaryawanDto extends PartialType(
  CreateLaporanCutiKaryawanDto,
) {}
