import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LogSaldoService } from './log_saldo.service';
import { CreateLogSaldoDto } from './dto/create-log_saldo.dto';
import { UpdateLogSaldoDto } from './dto/update-log_saldo.dto';
import { dbMssql } from 'src/common/utils/db';

@Controller('log-saldo')
export class LogSaldoController {
  constructor(private readonly logSaldoService: LogSaldoService) {}

  @Post()
  async create(@Body() createLogSaldoDto: CreateLogSaldoDto) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.logSaldoService.create(createLogSaldoDto, trx);
      await trx.commit();
      return result;
    } catch (error) {
      // Handle the error appropriately
      await trx.rollback();
      throw new Error(`Error creating log saldo: ${error.message}`);
    }
  }

  @Get()
  findAll() {
    return this.logSaldoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.logSaldoService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLogSaldoDto: UpdateLogSaldoDto,
  ) {
    return this.logSaldoService.update(+id, updateLogSaldoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.logSaldoService.remove(+id);
  }
}
