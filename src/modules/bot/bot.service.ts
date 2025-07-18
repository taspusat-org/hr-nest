import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api'; // Menggunakan import jika menggunakan ESModule
import { Client, ClientOptions, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { dbMssql } from 'src/common/utils/db';
@Injectable()
export class BotService {
  private bot: TelegramBot;
  private chatId: string = '-1002388728181'; // Ganti dengan ID grup Anda
  private whatsappGroupId: string = '6281321232720-1583291142@g.us'; // Ganti dengan ID grup WhatsApp
  private whatsappClient: Client;
  constructor() {
    const token = '7025202986:AAHLW64Ght3115fBdvRGaWqLHK-Dlimtvk4'; // Ganti dengan token bot Anda
    this.bot = new TelegramBot(token);
    const options: ClientOptions = {
      puppeteer: { headless: true }, // Gunakan headless: false untuk debugging
    };

    this.whatsappClient = new Client(options);

    this.whatsappClient.on('qr', (qr: string) => {
      console.log('QR received, generating...');
      qrcode.generate(qr, { small: true });
      console.log('Scan this QR code with your WhatsApp app to log in');
    });

    this.whatsappClient.on('ready', () => {
      console.log('WhatsApp client is ready!');
    });

    this.whatsappClient.on('authenticated', () => {
      console.log('WhatsApp client authenticated!');
    });

    this.whatsappClient.on('auth_failure', (message) => {
      console.error('Authentication failed:', message);
    });

    this.whatsappClient.on('disconnected', (reason) => {
      console.error('WhatsApp client disconnected:', reason);
    });

    // Inisialisasi client WhatsApp
    this.whatsappClient.initialize();
  }

  // Fungsi untuk mengirim pesan ke grup
  async sendMessage(message: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      console.error('Error saat mengirim pesan ke Telegram:', error);
    }
  }
  async sendWhatsappMessage(message: string): Promise<void> {
    try {
      await this.whatsappClient.sendMessage(this.whatsappGroupId, message);
    } catch (error) {
      console.error('Error sending message to WhatsApp:', error);
    }
  }
  async sendWhatsappMessage2(tgllahir: string, trx: any): Promise<void> {
    try {
      // Tunggu WhatsApp client siap
      console.log('Waiting for client to be ready...');
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Delay untuk memastikan client siap

      // Mengambil data karyawan dari database berdasarkan tanggal lahir yang sesuai dengan format dd-mm
      const nomorKaryawan = await trx('karyawan')
        .select('nohp', 'namakaryawan', 'jeniskelamin_id', 'tgllahir') // Menambahkan jeniskelamin_id ke dalam query
        .where('tgllahir', 'LIKE', `%${tgllahir}`) // Mencari karyawan yang lahir pada tanggal yang sesuai dengan hari dan bulan
        .where('statusaktif', '=', 131) // Pastikan hanya yang aktif
        .whereNull('tglresign'); // Pastikan hanya yang tidak resign

      if (nomorKaryawan.length === 0) {
        console.log(`Tidak ada karyawan yang lahir pada tanggal ${tgllahir}`);
        return; // Jika tidak ada karyawan yang ditemukan, keluar dari fungsi
      }

      for (const karyawan of nomorKaryawan) {
        const { nohp, namakaryawan, jeniskelamin_id } = karyawan;

        // Menentukan sapaan berdasarkan jeniskelamin_id
        let sapaan = 'Bapak/Ibuk'; // Default sapaan jika tidak ada jeniskelamin_id
        if (jeniskelamin_id == 37) {
          sapaan = 'Pak'; // Untuk jeniskelamin_id 37, gunakan "Pak"
        } else if (jeniskelamin_id == 36) {
          sapaan = 'Buk'; // Untuk jeniskelamin_id 36, gunakan "Buk"
        }

        // Cek jika nomor handphone dimulai dengan '0', ubah menjadi '62'
        let formattedNumber = nohp.replace(/\D/g, ''); // Menghapus karakter non-digit
        if (formattedNumber.startsWith('0')) {
          formattedNumber = '62' + formattedNumber.slice(1); // Ganti '0' menjadi '62'
        }
        formattedNumber += '@c.us'; // Menambahkan '@c.us' di akhir

        // Pesan ucapan selamat ulang tahun dengan sapaan dinamis
        const message = `Selamat ulang tahun ${sapaan} *${namakaryawan}*, Semoga sehat, sukses, dan bahagia selalu 🎂🥳🙏.\n\nDari : Management Transporindo.`;

        // Kirim pesan
        console.log(`Sending message to ${formattedNumber}`);
        await this.whatsappClient.sendMessage(formattedNumber, message);
        console.log(`Pesan berhasil dikirim ke ${formattedNumber}`);

        // Delay 2 detik sebelum mengirim pesan berikutnya
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('Error sending message to WhatsApp:', error);
    }
  }

  async sendMessageToNumbers(): Promise<void> {
    try {
      // Ambil nomor karyawan dan nama karyawan yang belum resign
      const nomorKaryawan = await dbMssql('karyawan')
        .select('nohp', 'namakaryawan')
        .whereNull('tglresign');

      const batchSize = 1; // Kirim ke 1 nomor per batch
      const delay = 5000; // Delay 5 detik antara batch

      // Fungsi untuk mengirim pesan ke batch
      const sendBatch = async (batch: { number: string; name: string }[]) => {
        for (const { number, name } of batch) {
          const formattedNumber = number.replace(/\D/g, '') + '@c.us'; // Format nomor WhatsApp

          // Modifikasi pesan dengan menyisipkan nama karyawan
          const personalizedMessage = `Halo ${name}, ini tes notifikasi dari transporindo pusat, hanya sekedar testing pengujian broadcast whatsapp`;

          try {
            // Kirim pesan
            await this.whatsappClient.sendMessage(
              formattedNumber,
              personalizedMessage,
            );
            console.log(`Pesan berhasil dikirim ke ${name} (${number})`);
          } catch (error) {
            // Jika gagal mengirim pesan (misalnya nomor tidak terdaftar)
            console.error(
              `Gagal mengirim pesan ke ${name} (${number}): ${error.message}`,
            );
          }
        }
      };

      // Bagi nomor menjadi batch
      for (let i = 0; i < nomorKaryawan.length; i += batchSize) {
        const batch = nomorKaryawan.slice(i, i + batchSize).map((row) => {
          let number = row.nohp;
          if (number.startsWith('0')) {
            number = '62' + number.slice(1);
          }
          return { number, name: row.namakaryawan };
        });

        // Kirim batch
        await sendBatch(batch);

        // Tunggu selama 5 detik sebelum melanjutkan ke batch berikutnya
        if (i + batchSize < nomorKaryawan.length) {
          console.log(
            'Menunggu 5 detik sebelum melanjutkan pengiriman pesan...',
          );
          await new Promise((resolve) => setTimeout(resolve, delay)); // Delay 5 detik
        }
      }
    } catch (error) {
      console.error('Gagal mengirim pesan:', error);
    }
  }

  async sendBulkMessages(
    numbers: string[],
    message: string,
    count: number,
  ): Promise<void> {
    try {
      // Mendeklarasikan tipe array sendPromises yang berisi Promise<Message>
      const sendPromises: Promise<Message>[] = [];

      // Mengirim pesan sebanyak count kali
      for (let i = 0; i < count; i++) {
        numbers.forEach((number) => {
          const formattedNumber = number.replace(/\D/g, '') + '@c.us'; // Format nomor WhatsApp
          const sendPromise = this.whatsappClient.sendMessage(
            formattedNumber,
            `${message} - Pesan ke ${i + 1}`,
          );
          sendPromises.push(sendPromise);
        });
      }

      // Menunggu semua pesan dikirim
      await Promise.all(sendPromises);
      console.log(`${sendPromises.length} pesan berhasil dikirim`);
    } catch (error) {
      console.error('Gagal mengirim pesan:', error);
    }
  }
  async getGroups(): Promise<any[]> {
    try {
      const chats = await this.whatsappClient.getChats();

      return chats;
    } catch (error) {
      console.error('Error fetching groups:', error);
      throw new Error('Error fetching groups');
    }
  }
}
