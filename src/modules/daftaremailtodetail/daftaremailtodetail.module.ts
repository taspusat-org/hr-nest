import { Module } from '@nestjs/common';
import { DaftaremailtodetailService } from './daftaremailtodetail.service';
import { DaftaremailtodetailController } from './daftaremailtodetail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';

@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [DaftaremailtodetailController],
  providers: [DaftaremailtodetailService],
})
export class DaftaremailtodetailModule {}
