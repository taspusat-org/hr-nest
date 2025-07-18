import { Module } from '@nestjs/common';
import { DaftaremailService } from './daftaremail.service';
import { DaftaremailController } from './daftaremail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [RedisModule, UtilsModule, AuthModule, LogtrailModule],
  controllers: [DaftaremailController],
  providers: [DaftaremailService],
})
export class DaftaremailModule {}
