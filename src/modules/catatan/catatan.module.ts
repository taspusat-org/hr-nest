import { Module } from '@nestjs/common';
import { CatatanService } from './catatan.service';
import { CatatanController } from './catatan.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [RedisModule, UtilsModule, AuthModule, LogtrailModule],
  controllers: [CatatanController],
  providers: [CatatanService],
})
export class CatatanModule {}
