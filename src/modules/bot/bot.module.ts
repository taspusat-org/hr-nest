import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';

@Module({
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService], // Ekspor BotService agar bisa digunakan di modul lain
})
export class BotModule {}
