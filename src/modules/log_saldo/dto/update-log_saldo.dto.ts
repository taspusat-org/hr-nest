import { PartialType } from '@nestjs/mapped-types';
import { CreateLogSaldoDto } from './create-log_saldo.dto';

export class UpdateLogSaldoDto extends PartialType(CreateLogSaldoDto) {}
