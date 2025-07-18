import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanResignDto } from './create-karyawan_resign.dto';

export class UpdateKaryawanResignDto extends PartialType(
  CreateKaryawanResignDto,
) {}
