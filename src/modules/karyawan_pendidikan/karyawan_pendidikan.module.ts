import { Module } from '@nestjs/common';
import { KaryawanPendidikanService } from './karyawan_pendidikan.service';
import { KaryawanPendidikanController } from './karyawan_pendidikan.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [KaryawanPendidikanController],
  providers: [KaryawanPendidikanService],
})
export class KaryawanPendidikanModule {}
