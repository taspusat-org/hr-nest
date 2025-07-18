import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanNomordaruratDto } from './create-karyawan_nomordarurat.dto';

export class UpdateKaryawanNomordaruratDto extends PartialType(
  CreateKaryawanNomordaruratDto,
) {}
