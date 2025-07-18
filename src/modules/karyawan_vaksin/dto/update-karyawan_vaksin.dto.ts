import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanVaksinDto } from './create-karyawan_vaksin.dto';

export class UpdateKaryawanVaksinDto extends PartialType(
  CreateKaryawanVaksinDto,
) {}
