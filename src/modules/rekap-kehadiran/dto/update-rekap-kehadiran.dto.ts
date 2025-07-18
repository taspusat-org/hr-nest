import { PartialType } from '@nestjs/mapped-types';
import { CreateRekapKehadiranDto } from './create-rekap-kehadiran.dto';

export class UpdateRekapKehadiranDto extends PartialType(
  CreateRekapKehadiranDto,
) {}
