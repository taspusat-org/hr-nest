import { PartialType } from '@nestjs/mapped-types';
import { CreateRekapitulasikehadiranDto } from './create-rekapitulasikehadiran.dto';

export class UpdateRekapitulasikehadiranDto extends PartialType(
  CreateRekapitulasikehadiranDto,
) {}
