import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanMutasiDto } from './create-karyawan_mutasi.dto';

export class UpdateKaryawanMutasiDto extends PartialType(
  CreateKaryawanMutasiDto,
) {}
