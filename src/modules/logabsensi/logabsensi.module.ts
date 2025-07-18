import { Module } from '@nestjs/common';
import { LogabsensiService } from './logabsensi.service';
import { LogabsensiController } from './logabsensi.controller';

@Module({
  controllers: [LogabsensiController],
  providers: [LogabsensiService],
})
export class LogabsensiModule {}
