import { Module } from '@nestjs/common';
import { MutasiService } from './mutasi.service';
import { MutasiController } from './mutasi.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [RedisModule, UtilsModule, AuthModule, LogtrailModule],
  controllers: [MutasiController],
  providers: [MutasiService],
})
export class MutasiModule {}
