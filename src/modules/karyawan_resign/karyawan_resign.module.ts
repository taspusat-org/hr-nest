import { Module } from '@nestjs/common';
import { KaryawanResignService } from './karyawan_resign.service';
import { KaryawanResignController } from './karyawan_resign.controller';
import { RedisModule } from 'src/common/redis/redis.module';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { UtilsService } from 'src/utils/utils.service';
import { MailModule } from 'src/common/mail/mail.module';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    RedisModule,
    UtilsModule,
    RabbitmqModule,
    AuthModule,
    LogtrailModule,
    MailModule,
    KaryawanModule,
  ],
  controllers: [KaryawanResignController],
  providers: [KaryawanResignService],
})
export class KaryawanResignModule {}
