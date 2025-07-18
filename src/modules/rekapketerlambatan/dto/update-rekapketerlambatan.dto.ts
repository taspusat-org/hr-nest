import { PartialType } from '@nestjs/mapped-types';
import { CreateRekapketerlambatanDto } from './create-rekapketerlambatan.dto';

export class UpdateRekapketerlambatanDto extends PartialType(
  CreateRekapketerlambatanDto,
) {}
