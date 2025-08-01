import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { MailModule } from './common/mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { AuthMiddleware } from './common/middlewares/auth.middleware';
import { UtilsModule } from './utils/utils.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisController } from './common/redis/redis.controller';
import { SocketModule } from './common/socket/socket.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AcosModule } from './modules/acos/acos.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { ErrorModule } from './modules/error/error.module';
import { ParameterModule } from './modules/parameter/parameter.module';
import { RedisService } from './common/redis/redis.service';
import { CacheModule } from '@nestjs/cache-manager';
import { LogtrailModule } from './common/logtrail/logtrail.module';
import { MenuModule } from './modules/menu/menu.module';
import { RoleModule } from './modules/role/role.module';
import { UserModule } from './modules/user/user.module';
import { OffdaysModule } from './modules/offdays/offdays.module';
import { RoleaclModule } from './modules/roleacl/roleacl.module';
import { UseraclModule } from './modules/useracl/useracl.module';
import { UserroleModule } from './modules/userrole/userrole.module';
import { RunningNumberModule } from './modules/running-number/running-number.module';
import { KnexModule } from './modules/knex/knex.module';
import { FieldlengthModule } from './modules/fieldlength/fieldlength.module';
import { CutidetailModule } from './modules/cutidetail/cutidetail.module';
import { KaryawanModule } from './modules/karyawan/karyawan.module';
import { KaryawanNomordaruratModule } from './modules/karyawan_nomordarurat/karyawan_nomordarurat.module';
import { KaryawanBerkasModule } from './modules/karyawan_berkas/karyawan_berkas.module';
import { KaryawanPendidikanModule } from './modules/karyawan_pendidikan/karyawan_pendidikan.module';
import { KaryawanPengalamankerjaModule } from './modules/karyawan_pengalamankerja/karyawan_pengalamankerja.module';
import { KaryawanVaksinModule } from './modules/karyawan_vaksin/karyawan_vaksin.module';
import { CutiModule } from './modules/cuti/cuti.module';
import { JabatanModule } from './modules/jabatan/jabatan.module';
import { IzinModule } from './modules/izin/izin.module';
import { ApprovaldetailModule } from './modules/approvaldetail/approvaldetail.module';
import { CutiapprovalModule } from './modules/cutiapproval/cutiapproval.module';
import { ApprovalheaderModule } from './modules/approvalheader/approvalheader.module';
import { IzinapprovalModule } from './modules/izinapproval/izinapproval.module';
import { CabangModule } from './modules/cabang/cabang.module';
import { DaftaremailModule } from './modules/daftaremail/daftaremail.module';
import { DaftaremailtodetailModule } from './modules/daftaremailtodetail/daftaremailtodetail.module';
import { DaftaremailccdetailModule } from './modules/daftaremailccdetail/daftaremailccdetail.module';
import { MutasiModule } from './modules/mutasi/mutasi.module';
import { JeniscatatanModule } from './modules/jeniscatatan/jeniscatatan.module';
import { CatatanModule } from './modules/catatan/catatan.module';
import { LaporanCutiKaryawanModule } from './modules/laporan_cuti_karyawan/laporan_cuti_karyawan.module';
import { LaporanIzinKaryawanModule } from './modules/laporan_izin_karyawan/laporan_izin_karyawan.module';
import { LogabsensiModule } from './modules/logabsensi/logabsensi.module';
import { KaryawanResignModule } from './modules/karyawan_resign/karyawan_resign.module';
import { ToemailModule } from './modules/toemail/toemail.module';
import { CcemailModule } from './modules/ccemail/ccemail.module';
import { ShiftModule } from './modules/shift/shift.module';
import { RekapitulasikehadiranModule } from './modules/rekapitulasikehadiran/rekapitulasikehadiran.module';
import { ShiftDetailModule } from './modules/shift_detail/shift_detail.module';
import { RekapketerlambatanModule } from './modules/rekapketerlambatan/rekapketerlambatan.module';
import { RekapKehadiranModule } from './modules/rekap-kehadiran/rekap-kehadiran.module';
import { ProsessaldoModule } from './modules/prosessaldo/prosessaldo.module';
import { RekapsaldocutiModule } from './modules/rekapsaldocuti/rekapsaldocuti.module';
import { RabbitmqModule } from './modules/rabbitmq/rabbitmq.module';
import { RabbitmqService } from './modules/rabbitmq/rabbitmq.service';
import { RabbitmqClientModule } from './modules/rabbitmq-client/rabbitmq-client.module';
import { KaryawanMutasiModule } from './modules/karyawan_mutasi/karyawan_mutasi.module';
import { JenisizinModule } from './modules/jenisizin/jenisizin.module';
import { CronjobSaldocutiModule } from './modules/cronjob-saldocuti/cronjob-saldocuti.module';
import { BotModule } from './modules/bot/bot.module';
import { LogSaldoModule } from './modules/log_saldo/log_saldo.module';
import { UsercabangModule } from './modules/usercabang/usercabang.module';

@Module({
  imports: [
    CacheModule.register(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    MailModule,
    AcosModule,
    ErrorModule,
    ParameterModule,
    UtilsModule,
    RedisModule,
    LogtrailModule,
    SocketModule,
    MenuModule,
    RoleModule,
    UserModule,
    OffdaysModule,
    RoleaclModule,
    UseraclModule,
    KnexModule,
    UserroleModule,
    RunningNumberModule,
    FieldlengthModule,
    CutidetailModule,
    KaryawanModule,
    KaryawanNomordaruratModule,
    KaryawanBerkasModule,
    KaryawanPendidikanModule,
    KaryawanPengalamankerjaModule,
    KaryawanVaksinModule,
    CutiModule,
    JabatanModule,
    IzinModule,
    ApprovaldetailModule,
    CutiapprovalModule,
    ApprovalheaderModule,
    IzinapprovalModule,
    CabangModule,
    DaftaremailModule,
    DaftaremailtodetailModule,
    DaftaremailccdetailModule,
    MutasiModule,
    JeniscatatanModule,
    CatatanModule,
    LaporanCutiKaryawanModule,
    LaporanIzinKaryawanModule,
    LogabsensiModule,
    KaryawanResignModule,
    ToemailModule,
    CcemailModule,
    ShiftModule,
    RekapitulasikehadiranModule,
    ShiftDetailModule,
    RekapketerlambatanModule,
    RekapKehadiranModule,
    ProsessaldoModule,
    RekapsaldocutiModule,
    RabbitmqModule,
    RabbitmqClientModule,
    KaryawanMutasiModule,
    JenisizinModule,
    CronjobSaldocutiModule,
    BotModule,
    LogSaldoModule,
    UsercabangModule,
  ],
  controllers: [],
  providers: [RabbitmqService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        'auth/{*splat}',
        'menu/*',
        'offdays/*',
        'redis/*path',
        'uploads/*',
        'offdays/*',
      )
      .forRoutes('*');
  }
}
