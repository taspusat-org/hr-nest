import { Module } from '@nestjs/common';
import { DaftaremailccdetailService } from './daftaremailccdetail.service';
import { DaftaremailccdetailController } from './daftaremailccdetail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';

@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [DaftaremailccdetailController],
  providers: [DaftaremailccdetailService],
})
export class DaftaremailccdetailModule {}
