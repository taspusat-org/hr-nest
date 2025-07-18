import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanPendidikanDto } from './create-karyawan_pendidikan.dto';

export class UpdateKaryawanPendidikanDto extends PartialType(
  CreateKaryawanPendidikanDto,
) {}
