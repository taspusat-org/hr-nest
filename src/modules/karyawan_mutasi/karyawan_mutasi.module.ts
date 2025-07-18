import { Module } from '@nestjs/common';
import { KaryawanMutasiService } from './karyawan_mutasi.service';
import { KaryawanMutasiController } from './karyawan_mutasi.controller';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { MailModule } from 'src/common/mail/mail.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { AuthModule } from '../auth/auth.module';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [
    RedisModule,
    UtilsModule,
    AuthModule,
    LogtrailModule,
    MailModule,
    KaryawanModule,
  ],
  controllers: [KaryawanMutasiController],
  providers: [KaryawanMutasiService],
})
export class KaryawanMutasiModule {}
