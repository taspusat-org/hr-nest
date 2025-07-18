import { Module } from '@nestjs/common';
import { ProsessaldoService } from './prosessaldo.service';
import { ProsessaldoController } from './prosessaldo.controller';
import { RekapsaldocutiModule } from '../rekapsaldocuti/rekapsaldocuti.module';

@Module({
  imports: [RekapsaldocutiModule],
  controllers: [ProsessaldoController],
  providers: [ProsessaldoService],
  exports: [ProsessaldoService], // Exporting the service if needed in other modules
})
export class ProsessaldoModule {}
