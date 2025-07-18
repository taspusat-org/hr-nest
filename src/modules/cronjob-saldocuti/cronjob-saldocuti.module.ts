import { Module } from '@nestjs/common';
import { CronjobSaldocutiService } from './cronjob-saldocuti.service';
import { CronjobSaldocutiController } from './cronjob-saldocuti.controller';
import { ProsessaldoModule } from '../prosessaldo/prosessaldo.module';
import { BotModule } from '../bot/bot.module';
import { LogSaldoModule } from '../log_saldo/log_saldo.module';

@Module({
  imports: [ProsessaldoModule, BotModule, LogSaldoModule],
  controllers: [CronjobSaldocutiController],
  providers: [CronjobSaldocutiService],
})
export class CronjobSaldocutiModule {}
