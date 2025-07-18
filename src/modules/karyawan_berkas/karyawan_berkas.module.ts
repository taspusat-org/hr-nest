import { Module } from '@nestjs/common';
import { KaryawanBerkasService } from './karyawan_berkas.service';
import { KaryawanBerkasController } from './karyawan_berkas.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [KaryawanBerkasController],
  providers: [KaryawanBerkasService],
})
export class KaryawanBerkasModule {}
