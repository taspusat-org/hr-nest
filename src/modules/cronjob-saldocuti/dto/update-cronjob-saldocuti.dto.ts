import { PartialType } from '@nestjs/mapped-types';
import { CreateCronjobSaldocutiDto } from './create-cronjob-saldocuti.dto';

export class UpdateCronjobSaldocutiDto extends PartialType(
  CreateCronjobSaldocutiDto,
) {}
