import { Injectable } from '@nestjs/common';
import { CreateCronjobSaldocutiDto } from './dto/create-cronjob-saldocuti.dto';
import { UpdateCronjobSaldocutiDto } from './dto/update-cronjob-saldocuti.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProsessaldoService } from '../prosessaldo/prosessaldo.service';
import { dbMssql } from 'src/common/utils/db';
import { BotService } from '../bot/bot.service';
import { LogSaldoService } from '../log_saldo/log_saldo.service';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class CronjobSaldocutiService {
  constructor(
    private readonly prosessaldoService: ProsessaldoService,
    private readonly logSaldoService: LogSaldoService,
    private readonly botService: BotService,
  ) {}

  // Menjalankan fungsi prosesSaldoAwal setiap jam 00:00
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleProsesSaldoAwal() {
    const trx = await dbMssql.transaction();
    const ptgl = this.getTodayDate(); // Mendapatkan tanggal hari ini

    // Memformat waktu menjadi HH:mm:ss menggunakan Intl.DateTimeFormat

    const dataSaldo: any = {
      tanggal: ptgl,
      jenistransaksi: 'SALDOCUTI',
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    };
    const data: any = {
      tanggal: ptgl,
      jenistransaksi: 'KARTUCUTI',
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    };

    try {
      const currentTime = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      await this.prosessaldoService.prosesSaldoKartuCuti(ptgl, trx);
      await this.prosessaldoService.prosesSaldo(ptgl, trx);
      await this.logSaldoService.create(data, trx);
      await this.logSaldoService.create(dataSaldo, trx);
      await trx.commit(); // Commit transaksi jika proses berhasil
      await this.botService.sendMessage(
        `Proses saldo awal berhasil dijalankan untuk tanggal ${ptgl} ${currentTime}.✅`,
      );
      await this.botService.sendWhatsappMessage(
        `Proses saldo awal berhasil dijalankan untuk tanggal ${ptgl} ${currentTime}.✅`,
      );
    } catch (error) {
      await trx.rollback(); // Rollback transaksi jika terjadi error
      console.error('Error saat menjalankan proses saldo awal', error);
      const currentTime = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      await this.botService.sendMessage(
        `Proses saldo awal gagal dijalankan untuk tanggal ${ptgl} ${currentTime}.❌, silahkan jalankan Manual melalui url (${process.env.URLWEB}/prosessaldo?ptgl=${ptgl})`,
      );
    }
  }

  // Fungsi untuk mendapatkan tanggal hari ini dalam format YYYY-MM-DD
  private getTodayDate(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm: string | number = today.getMonth() + 1; // Bulan dimulai dari 0
    let dd: string | number = today.getDate();

    // Tambahkan leading zero jika bulan atau hari kurang dari 10
    if (mm < 10) mm = `0${mm}`;
    if (dd < 10) dd = `0${dd}`;

    return `${dd}-${mm}-${yyyy}`; // Format tanggal: YYYY-MM-DD
  }
}
