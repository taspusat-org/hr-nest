import { PartialType } from '@nestjs/mapped-types';
import { CreateProsessaldoDto } from './create-prosessaldo.dto';

export class UpdateProsessaldoDto extends PartialType(CreateProsessaldoDto) {}
