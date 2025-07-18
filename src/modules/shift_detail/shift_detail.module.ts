import { Module } from '@nestjs/common';
import { ShiftDetailService } from './shift_detail.service';
import { ShiftDetailController } from './shift_detail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [ShiftDetailController],
  providers: [ShiftDetailService],
})
export class ShiftDetailModule {}
