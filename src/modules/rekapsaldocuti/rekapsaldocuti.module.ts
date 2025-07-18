import { Module } from '@nestjs/common';
import { RekapsaldocutiService } from './rekapsaldocuti.service';
import { RekapsaldocutiController } from './rekapsaldocuti.controller';

@Module({
  controllers: [RekapsaldocutiController],
  providers: [RekapsaldocutiService],
  exports: [RekapsaldocutiService],
})
export class RekapsaldocutiModule {}
