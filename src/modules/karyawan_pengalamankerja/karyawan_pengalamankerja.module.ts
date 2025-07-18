import { Module } from '@nestjs/common';
import { KaryawanPengalamankerjaService } from './karyawan_pengalamankerja.service';
import { KaryawanPengalamankerjaController } from './karyawan_pengalamankerja.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [KaryawanPengalamankerjaController],
  providers: [KaryawanPengalamankerjaService],
})
export class KaryawanPengalamankerjaModule {}
