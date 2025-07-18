import { PartialType } from '@nestjs/mapped-types';
import { CreateRekapsaldocutiDto } from './create-rekapsaldocuti.dto';

export class UpdateRekapsaldocutiDto extends PartialType(
  CreateRekapsaldocutiDto,
) {}
