import { Module } from '@nestjs/common';
import { RekapitulasikehadiranService } from './rekapitulasikehadiran.service';
import { RekapitulasikehadiranController } from './rekapitulasikehadiran.controller';
import { KnexModule } from '../knex/knex.module';

@Module({
  imports: [KnexModule],
  controllers: [RekapitulasikehadiranController],
  providers: [RekapitulasikehadiranService],
})
export class RekapitulasikehadiranModule {}
