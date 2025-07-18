import { Module } from '@nestjs/common';
import { JabatanService } from './jabatan.service';
import { JabatanController } from './jabatan.controller';
import { RedisModule } from 'src/common/redis/redis.module';
import { UtilsModule } from 'src/utils/utils.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { AuthModule } from '../auth/auth.module';
import { UtilsService } from 'src/utils/utils.service';

@Module({
  imports: [RedisModule, UtilsModule, AuthModule, LogtrailModule],
  controllers: [JabatanController],
  providers: [JabatanService, UtilsService],
})
export class JabatanModule {}
