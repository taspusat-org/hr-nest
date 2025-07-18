import { Module } from '@nestjs/common';
import { KaryawanService } from './karyawan.service';
import { KaryawanController } from './karyawan.controller';
import { RedisModule } from 'src/common/redis/redis.module';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { UtilsService } from 'src/utils/utils.service';
import { MailModule } from 'src/common/mail/mail.module';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [
    RedisModule,
    UtilsModule,
    AuthModule,
    LogtrailModule,
    MailModule,
    RabbitmqModule,
  ],
  controllers: [KaryawanController],
  providers: [KaryawanService, UtilsService],
  exports: [KaryawanService],
})
export class KaryawanModule {}
