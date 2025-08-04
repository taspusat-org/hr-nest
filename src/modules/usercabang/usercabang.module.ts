import { Module } from '@nestjs/common';
import { UsercabangService } from './usercabang.service';
import { UsercabangController } from './usercabang.controller';
import { AuthModule } from '../auth/auth.module';
import { UtilsModule } from 'src/utils/utils.module';

@Module({
  imports: [AuthModule, UtilsModule],
  controllers: [UsercabangController],
  providers: [UsercabangService],
})
export class UsercabangModule {}
