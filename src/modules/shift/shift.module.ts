import { Module } from '@nestjs/common';
import { ShiftService } from './shift.service';
import { ShiftController } from './shift.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [RedisModule, UtilsModule, AuthModule, LogtrailModule],
  controllers: [ShiftController],
  providers: [ShiftService],
})
export class ShiftModule {}
