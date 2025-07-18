import { PartialType } from '@nestjs/mapped-types';
import { CreateMutasiDto } from './create-mutasi.dto';

export class UpdateMutasiDto extends PartialType(CreateMutasiDto) {}
