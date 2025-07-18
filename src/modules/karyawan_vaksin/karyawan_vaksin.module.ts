import { Module } from '@nestjs/common';
import { KaryawanVaksinService } from './karyawan_vaksin.service';
import { KaryawanVaksinController } from './karyawan_vaksin.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [KaryawanVaksinController],
  providers: [KaryawanVaksinService],
})
export class KaryawanVaksinModule {}
