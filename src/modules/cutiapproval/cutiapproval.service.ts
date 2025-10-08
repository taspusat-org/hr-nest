import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateCutiapprovalDto } from './dto/create-cutiapproval.dto';
import { UpdateCutiapprovalDto } from './dto/update-cutiapproval.dto';
import { dbMssql } from 'src/common/utils/db';
import { MailService } from 'src/common/mail/mail.service';
import { KaryawanService } from '../karyawan/karyawan.service';
import { formatEmailDate } from 'src/utils/utils.service';

@Injectable()
export class CutiapprovalService {
  private readonly tableName = 'cutiapproval';
  constructor(
    private readonly mailService: MailService,
    private readonly karyawanService: KaryawanService,
  ) {}

  async create(data: any, trx: any = null, modifiedby: any) {
    data.modifiedby = modifiedby;
    const insertedItems = await trx(this.tableName).insert(data).returning('*');

    return insertedItems;
  }
  formatTanggal = (d: string | Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long', // Nama hari dalam bentuk panjang (e.g., "Jumat")
      day: '2-digit', // Angka hari dengan dua digit (e.g., "11")
      month: 'long', // Nama bulan dalam bentuk panjang (e.g., "April")
      year: 'numeric', // Tahun dalam format numerik (e.g., "2025")
    };

    return new Date(d).toLocaleDateString('id-ID', options).toUpperCase(); // Gunakan 'id-ID' untuk bahasa Indonesia
  };

  async findByCutiId(cutiId: number, trx: any) {
    try {
      const cutiApproval = await trx(`${this.tableName} as c`)
        .select([
          'c.id',
          'c.cuti_id',
          'c.karyawan_id',
          'c.jenjangapproval',
          'c.statusapproval',
          'k.namakaryawan as namakaryawan',
          'c.info',
          trx.raw("FORMAT(c.tglapproval, 'dd-MM-yyyy') as tglapproval"),
          trx.raw("FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        ])
        .where('c.cuti_id', cutiId)
        .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
        .orderBy('c.jenjangapproval', 'ASC');

      return cutiApproval;
    } catch (error) {
      console.error('Error fetching cuti details:', error);
      throw error;
    }
  }

  async approve(
    cutiId: number,
    karyawanId: number,
    statusnonhitung: string,
    trx: any,
  ) {
    try {
      // 1. Update status approval

      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'APPROVAL');
      const updated = await trx(this.tableName)
        .where('cuti_id', cutiId)
        .andWhere('karyawan_id', karyawanId)
        .update({
          statusapproval: dataParameter[0].id, // DISETUJUI status
          tglapproval: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      const [{ count: totalApprovals }] = (await trx(this.tableName)
        .count('id as count')
        .where('cuti_id', cutiId)) as { count: number }[];

      const { jenjangapproval } = await trx(this.tableName)
        .select('jenjangapproval')
        .where('cuti_id', cutiId)
        .andWhere('karyawan_id', karyawanId)
        .first();
      if (jenjangapproval === totalApprovals) {
        const updateCuti = await trx('cuti').where('id', cutiId).update({
          statusnonhitung: statusnonhitung, // DISETUJUI status
          updated_at: trx.fn.now(),
          statuscuti: dataParameter[0].id,
        });
      }
      const cuti = await trx('cuti').select('*').where('id', cutiId).first();
      const detailCuti = await trx('cutidetail')
        .select('*')
        .where('cuti_id', cutiId);

      const rawTglPengajuan = cuti.tglpengajuan;
      const formattedTglPengajuan = formatEmailDate(rawTglPengajuan);

      // 3. Ambil data karyawan (pengaju) dan email atasan
      const pengaju = await this.karyawanService.findById(
        cuti.karyawan_id,
        trx,
      );

      const atasanKaryawanId = await trx('cutiapproval')
        .select('karyawan_id')
        .where('cuti_id', cutiId);
      const emailDetails = await trx('daftaremailtodetail')
        .select('toemail_id')
        .where('daftaremail_id', pengaju.daftaremail_id);
      const emails = await trx('toemail')
        .select('email')
        .whereIn(
          'id',
          emailDetails.map((detail: any) => detail.toemail_id),
        );
      const ccEmailsData = await trx('daftaremailccdetail')
        .select('ccemail_id')
        .where('daftaremail_id', pengaju.daftaremail_id);

      // Fetch actual email addresses from `ccemail` table
      const ccEmails = await trx('ccemail')
        .select('email')
        .whereIn(
          'id',
          ccEmailsData.map((cc: any) => cc.ccemail_id),
        );
      const karyawanIds = atasanKaryawanId.map(
        (item: { karyawan_id: number }) => item.karyawan_id,
      );
      const emailAtasan = await trx('karyawan')
        .select('email')
        .whereIn('id', karyawanIds); // Using whereIn to get emails for multiple karyawan_id values
      const atasanEmails = emailAtasan.map((e) => e.email);
      const emailPengaju = pengaju.email;
      const allEmails = [
        ...atasanEmails, // Email atasan
        emailPengaju, // Email pengaju
        ...emails.map((to: any) => to.email), // toemailArray
      ];

      // Remove duplicates from the `ccemail` array that are already in `allEmails`
      const uniqueCcEmails = ccEmails
        .map((cc: any) => cc.email.toUpperCase()) // Convert to uppercase
        .filter((ccEmail) => !allEmails.includes(ccEmail.toUpperCase())); // Remove already included emails

      const uniqueRecipientEmails = [
        ...new Set([
          ...allEmails.map((email) => email.toUpperCase()), // Normalize to uppercase and ensure uniqueness
        ]),
      ];
      const payload = {
        email: uniqueRecipientEmails,
        ccemail: uniqueCcEmails,
        name: pengaju.namakaryawan,
        jabatan: pengaju.jabatan_nama,
        cabang: pengaju.cabang_nama,
        alasanPengajuan: cuti.alasancuti,
        jumlahCuti: cuti.jumlahcuti,
        namakaryawan: pengaju.namakaryawan,
        tglCuti: cuti.tglcuti,
        tglPengajuan: formattedTglPengajuan,
        status: jenjangapproval < totalApprovals ? 'DIKONFIRMASI' : 'DISETUJUI',
        statussubject:
          jenjangapproval < totalApprovals ? '(DIKONFIRMASI)' : '(DISETUJUI)',
      };
      await this.mailService.sendEmailCuti(payload);
      // 6. Insert into kartucuti only if DISETUJUI (statusapproval = 1)

      if (updated && jenjangapproval >= totalApprovals) {
        // Ensure periodetgldari and periodetglsampai are in 'YYYY-MM-DD' format
        if (!statusnonhitung) {
          await trx.rollback();
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Status non hitung tidak boleh kosong',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        // 7. Insert data ke kartucuti berdasarkan detailcuti

        for (let i = 0; i < detailCuti.length; i++) {
          const detail = detailCuti[i];
          if (statusnonhitung == '147') {
            await trx('kartucuti').insert({
              karyawan_id: pengaju.id,
              cabang_id: pengaju.cabang_id,
              periodetgldari: detail.periodecutidari,
              periodetglsampai: detail.periodecutisampai,
              tgltransaksi: detail.tglcuti, // tgltransaksi sesuai dengan tglcuti
              jenistransaksi: 'CUTI', // Jenistransaksi = 'CUTI'
              masuk: 0, // masuk sesuai dengan jumlah cuti yang diajukan
              keluar: 1, // Keluar = 1 untuk setiap pengambilan cuti
              cuti_id: cutiId, // Tambahkan cuti_id untuk referensi
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });
          } else {
            await trx('kartucuti').insert({
              karyawan_id: pengaju.id,
              cabang_id: pengaju.cabang_id,
              periodetgldari: detail.periodecutidari,
              periodetglsampai: detail.periodecutisampai,
              tgltransaksi: detail.tglcuti, // tgltransaksi sesuai dengan tglcuti
              jenistransaksi: 'CUTI', // Jenistransaksi = 'CUTI'
              cuti_id: cutiId, // Tambahkan cuti_id untuk referensi
              masuk: 0, // masuk sesuai dengan jumlah cuti yang diajukan
              keluar: 0, // Keluar = 1 untuk setiap pengambilan cuti
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });
          }
        }
      }

      return updated;
    } catch (error) {
      console.error('Error updating statusapproval:', error);
      throw error;
    }
  }

  async reject(
    cutiId: number,
    karyawanId: number,
    alasanpenolakan: string,
    trx: any,
  ) {
    try {
      // 1. Update statusapproval jadi 2 (DITOLAK)

      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'DITOLAK');

      await trx(this.tableName).where('cuti_id', cutiId).update({
        statusapproval: dataParameter[0].id, // DITOLAK
        tglapproval: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      // 2. Ambil data cuti untuk mendapatkan pengaju + detail alasan/jumlah/tanggal
      const cuti = await trx('cuti').select('*').where('id', cutiId).first();
      const rejectCuti = await trx('cuti').where('id', cutiId).update({
        alasanpenolakan: alasanpenolakan.toUpperCase(), // DISETUJUI status
        statuscuti: dataParameter[0].id,
        updated_at: trx.fn.now(),
      });

      // 3. Ambil data karyawan **pengaju**
      const pengaju = await this.karyawanService.findById(
        cuti.karyawan_id,
        trx,
      );

      // 4. Ambil email atasan pengaju (diasumsikan ada field `atasan_id`)
      const atasanKaryawanId = await trx('cutiapproval')
        .select('karyawan_id')
        .where('cuti_id', cutiId);
      const emailDetails = await trx('daftaremailtodetail')
        .select('toemail_id')
        .where('daftaremail_id', pengaju.daftaremail_id);
      const emails = await trx('toemail')
        .select('email')
        .whereIn(
          'id',
          emailDetails.map((detail: any) => detail.toemail_id),
        );
      const karyawanIds = atasanKaryawanId.map(
        (item: { karyawan_id: number }) => item.karyawan_id,
      );
      const emailAtasan = await trx('karyawan')
        .select('email')
        .whereIn('id', karyawanIds); // Using whereIn to get emails for multiple karyawan_id values
      const atasanEmails = emailAtasan.map((e) => e.email);
      const emailPengaju = pengaju.email;
      const ccEmailsData = await trx('daftaremailccdetail')
        .select('ccemail_id')
        .where('daftaremail_id', pengaju.daftaremail_id);

      // Fetch actual email addresses from `ccemail` table
      const ccEmails = await trx('ccemail')
        .select('email')
        .whereIn(
          'id',
          ccEmailsData.map((cc: any) => cc.ccemail_id),
        );

      // Combine all email arrays: toEmailArray, ccemailArray, and individual emails (atasan + pengaju)
      const allEmails = [
        ...atasanEmails, // Email atasan
        emailPengaju, // Email pengaju
        ...emails.map((to: any) => to.email), // toemailArray
      ];

      // Remove duplicates from the `ccemail` array that are already in `allEmails`
      const uniqueCcEmails = ccEmails
        .map((cc: any) => cc.email) // Extract the emails from ccEmails
        .filter((ccEmail) => !allEmails.includes(ccEmail)); // Remove emails already in allEmails

      // Combine the unique CC emails with the TO emails (allEmails)
      const uniqueRecipientEmails = [...new Set(allEmails)];

      // 5. Format tanggal agar hanya "Fri Apr 11 2025"
      const rawTglPengajuan = cuti.tglpengajuan;
      const formattedTglPengajuan = formatEmailDate(rawTglPengajuan);

      // 6. Siapkan payload email
      const payload = {
        email: uniqueRecipientEmails,
        ccemail: uniqueCcEmails, // CC emails without duplicates
        name: pengaju.namakaryawan,
        jabatan: pengaju.jabatan_nama,
        cabang: pengaju.cabang_nama,
        alasanPengajuan: cuti.alasancuti,
        jumlahCuti: cuti.jumlahcuti,
        namakaryawan: pengaju.namakaryawan,
        status: 'DITOLAK',
        statussubject: '(DITOLAK)',
        tglCuti: cuti.tglcuti,
        tglPengajuan: formattedTglPengajuan,
        alasanpenolakan: alasanpenolakan,
      };

      await this.mailService.sendEmailCuti(payload);

      // 8. Hapus data yang ada di kartucuti berdasarkan tglcuti di detailcuti
      const detailCuti = await trx('cutidetail')
        .select('tglcuti')
        .where('cuti_id', cutiId);

      // Loop melalui setiap tglcuti untuk menghapus data kartucuti yang sesuai
      for (const detail of detailCuti) {
        await trx('kartucuti')
          .where('karyawan_id', cuti.karyawan_id)
          .andWhere('tgltransaksi', detail.tglcuti) // Hapus berdasarkan tgltransaksi yang sama dengan tglcuti
          .delete();
      }

      return { success: true };
    } catch (error) {
      console.error('Error rejecting approval:', error);
      throw error;
    }
  }

  async updateApprovalStatus(cutiId: number, trx: any) {
    try {
      // Update statusapproval to 3 where cuti_id matches
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'DIBATALKAN');

      const updated = await trx('cutiapproval')
        .where('cuti_id', cutiId)
        .update({
          statusapproval: dataParameter[0].id, // Set statusapproval to 3
          updated_at: trx.fn.now(), // Update the updated_at timestamp
        });

      const datacuti = await trx('cuti')
        .select('*')
        .where('id', cutiId)
        .first();
      const dataKaryawan = await this.karyawanService.findById(
        datacuti.karyawan_id,
        trx,
      );
      const karyawanId = await trx('cutiapproval')
        .select('karyawan_id')
        .where('cuti_id', cutiId);
      const emailDetails = await trx('daftaremailtodetail')
        .select('toemail_id')
        .where('daftaremail_id', dataKaryawan.daftaremail_id);
      const emails = await trx('toemail')
        .select('email')
        .whereIn(
          'id',
          emailDetails.map((detail: any) => detail.toemail_id),
        );
      const ccEmailsData = await trx('daftaremailccdetail')
        .select('ccemail_id')
        .where('daftaremail_id', dataKaryawan.daftaremail_id);

      // Fetch actual email addresses from `ccemail` table
      const ccEmails = await trx('ccemail')
        .select('email')
        .whereIn(
          'id',
          ccEmailsData.map((cc: any) => cc.ccemail_id),
        );

      // Create array of emails
      const ccemailArray = ccEmails.map((cc: any) => cc.email);
      const toemailArray = emails.map((to: any) => to.email);
      // Extracting the karyawan_id values from the karyawanId array
      const karyawanIds = karyawanId.map(
        (item: { karyawan_id: number }) => item.karyawan_id,
      );

      const emailAtasan = await trx('karyawan')
        .select('email')
        .whereIn('id', karyawanIds); // Using whereIn to get emails for multiple karyawan_id values
      const pengajuEmail = dataKaryawan.email;
      const atasanEmails = emailAtasan.map((e) => e.email);
      // gabungkan semua penerima: atasan + pengaju
      const recipientEmails = [...atasanEmails, pengajuEmail];
      const rawTglPengajuan = datacuti.tglpengajuan;
      const formattedTglPengajuan = formatEmailDate(rawTglPengajuan);
      const allEmails = [
        ...recipientEmails, // Atasan and pengaju emails
        ...toemailArray, // TO emails
      ];
      const uniqueCcEmails = ccemailArray.filter(
        (email) => !allEmails.includes(email), // Filter out emails already in recipientEmails/toemailArray
      );
      const uniqueEmailRecipients = [...new Set(allEmails)];

      const payload = {
        email: uniqueEmailRecipients,
        ccemail: uniqueCcEmails,
        name: dataKaryawan.namakaryawan,
        jabatan: dataKaryawan.jabatan_nama,
        cabang: dataKaryawan.cabang_nama,
        alasanPengajuan: datacuti.alasancuti,
        jumlahCuti: datacuti.jumlahcuti,
        namakaryawan: dataKaryawan.namakaryawan,
        status: '[DIBATALKAN]',
        statussubject: '(DIBATALKAN)',
        tglCuti: datacuti.tglcuti ? datacuti.tglcuti.toUpperCase() : '',
        tglPengajuan: formattedTglPengajuan,
      };
      // Remove duplicates by creating a Set, then convert it back to an array
      await this.mailService.sendEmailCuti(payload);
      return updated;
    } catch (error) {
      console.error('Error updating statusapproval:', error);
      throw error;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} cutiapproval`;
  }

  update(id: number, updateCutiapprovalDto: UpdateCutiapprovalDto) {
    return `This action updates a #${id} cutiapproval`;
  }

  remove(id: number) {
    return `This action removes a #${id} cutiapproval`;
  }
}
function where(arg0: string, cutiId: number) {
  throw new Error('Function not implemented.');
}
