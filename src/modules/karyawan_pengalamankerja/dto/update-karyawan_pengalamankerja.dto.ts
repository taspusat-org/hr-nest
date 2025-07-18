import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanPengalamankerjaDto } from './create-karyawan_pengalamankerja.dto';

export class UpdateKaryawanPengalamankerjaDto extends PartialType(
  CreateKaryawanPengalamankerjaDto,
) {}
