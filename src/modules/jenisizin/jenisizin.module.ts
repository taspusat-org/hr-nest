import { Module } from '@nestjs/common';
import { JenisizinService } from './jenisizin.service';
import { JenisizinController } from './jenisizin.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';

@Module({
  imports: [UtilsModule, RedisModule, AuthModule, LogtrailModule],
  controllers: [JenisizinController],
  providers: [JenisizinService],
})
export class JenisizinModule {}
