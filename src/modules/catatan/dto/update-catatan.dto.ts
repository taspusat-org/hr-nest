import { PartialType } from '@nestjs/mapped-types';
import { CreateCatatanDto } from './create-catatan.dto';

export class UpdateCatatanDto extends PartialType(CreateCatatanDto) {}
