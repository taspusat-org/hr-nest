import { Module } from '@nestjs/common';
import { RunningNumberService } from './running-number.service';
import { RunningNumberController } from './running-number.controller';

@Module({
  controllers: [RunningNumberController],
  providers: [RunningNumberService],
})
export class RunningNumberModule {}
