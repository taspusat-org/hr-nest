import { Module } from '@nestjs/common';
import { CutidetailService } from './cutidetail.service';
import { CutidetailController } from './cutidetail.controller';
import { UtilsModule } from 'src/utils/utils.module';
import { LogtrailModule } from 'src/common/logtrail/logtrail.module';
import { KaryawanModule } from '../karyawan/karyawan.module';

@Module({
  imports: [UtilsModule, LogtrailModule, KaryawanModule],
  controllers: [CutidetailController],
  providers: [CutidetailService],
  exports: [CutidetailService],
})
export class CutidetailModule {}
