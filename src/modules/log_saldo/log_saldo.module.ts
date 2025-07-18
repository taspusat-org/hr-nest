import { Module } from '@nestjs/common';
import { LogSaldoService } from './log_saldo.service';
import { LogSaldoController } from './log_saldo.controller';

@Module({
  controllers: [LogSaldoController],
  providers: [LogSaldoService],
  exports: [LogSaldoService], // Export LogSaldoService so it can be used in other modules
})
export class LogSaldoModule {}
