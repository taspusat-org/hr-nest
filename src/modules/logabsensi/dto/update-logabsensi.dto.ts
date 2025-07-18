import { PartialType } from '@nestjs/mapped-types';
import { CreateLogabsensiDto } from './create-logabsensi.dto';

export class UpdateLogabsensiDto extends PartialType(CreateLogabsensiDto) {}
