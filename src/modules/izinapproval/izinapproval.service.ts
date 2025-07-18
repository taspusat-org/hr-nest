import { Injectable } from '@nestjs/common';
import { CreateIzinapprovalDto } from './dto/create-izinapproval.dto';
import { UpdateIzinapprovalDto } from './dto/update-izinapproval.dto';
import { dbMssql } from 'src/common/utils/db';
import { formatEmailDate } from 'src/utils/utils.service';
import { MailService } from 'src/common/mail/mail.service';
import { KaryawanService } from '../karyawan/karyawan.service';
import { IzinService } from '../izin/izin.service';

@Injectable()
export class IzinapprovalService {
  private readonly tableName = 'izinapproval';
  constructor(
    private readonly mailService: MailService,
    private readonly karyawanService: KaryawanService,
  ) {}
  async updateApprovalStatus(izinId: number, trx: any) {
    try {
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'DIBATALKAN');
      // Update statusapproval to 3 where izin_id matches
      const updated = await trx('izinapproval')
        .where('izin_id', izinId)
        .update({
          statusapproval: dataParameter[0].id, // Set statusapproval to 3
          updated_at: trx.fn.now(), // Update the updated_at timestamp
        });

      const dataizin = await this.findIzinById(izinId, trx);
      const dataKaryawan = await this.karyawanService.findById(
        dataizin.karyawan_id,
        trx,
      );
      const karyawanId = await trx('izinapproval')
        .select('karyawan_id')
        .where('izin_id', izinId);
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
      const rawTglPengajuan = dataizin.tglpengajuan;
      const formattedTglIzin = formatEmailDate(dataizin.tglizin);

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
        alasanIzin: dataizin.alasanizin,
        namakaryawan: dataKaryawan.namakaryawan,
        jamIzin: dataizin.jampengajuan,
        tglIzin: formattedTglIzin,
        tglPengajuan: formattedTglPengajuan,
        status: '[DIBATALKAN]',
        statussubject: '(DIBATALKAN)',
      };
      // Remove duplicates by creating a Set, then convert it back to an array
      await this.mailService.sendEmailIzin(payload);
      return updated;
    } catch (error) {
      console.error('Error updating statusapproval:', error);
      throw error;
    }
  }
  async findById(izinId: number, trx: any) {
    try {
      const cutiApproval = await trx(`${this.tableName} as c`)
        .select([
          'c.id',
          'c.izin_id',
          'c.jenjangapproval',
          'c.statusapproval',
          'c.karyawan_id',
          'k.namakaryawan as namakaryawan',
          'c.info',
          trx.raw("FORMAT(c.tglapproval, 'dd-MM-yyyy') as tglapproval"),
          trx.raw("FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        ])
        .where('c.izin_id', izinId)
        .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
        .orderBy('c.jenjangapproval', 'ASC');

      return cutiApproval;
    } catch (error) {
      console.error('Error fetching cuti details:', error);
      throw error;
    }
  }
  async findIzinById(id: number, trx: any) {
    try {
      const query = trx(`izin as u`)
        .select([
          'u.id as id',
          trx.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
          trx.raw('CONVERT(VARCHAR(5), u.jampengajuan, 108) as jampengajuan'),
          'u.karyawan_id',
          trx.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') as tglizin"),
          'u.statusizin',
          'u.statusizinbatal',
          'u.alasanizin',
          'u.jenisizin_id',
          'u.statusapprovalatasan',
          trx.raw(
            "FORMAT(u.tglapprovalatasan, 'dd-MM-yyyy') as tglapprovalatasan",
          ),
          'u.userapprovalatasan',
          'u.statusapprovalhrd',
          trx.raw("FORMAT(u.tglapprovalhrd, 'dd-MM-yyyy') as tglapprovalhrd"),
          'u.userapprovalhrd',
          'u.info',
          'u.modifiedby',
          trx.raw("FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
          'k.namakaryawan as karyawan_nama',
          'k.namaalias as namaalias',
          'p1.memo as statusizin_memo',
          'p2.memo as statusizinbatal_memo',
          'p3.text as jenisizin_text',
        ])
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .leftJoin('parameter as p1', 'u.statusizin', 'p1.id')
        .leftJoin('parameter as p2', 'u.statusizinbatal', 'p2.id')
        .leftJoin('parameter as p3', 'u.jenisizin_id', 'p3.id')
        .where('u.id', '=', id); // Mencari berdasarkan id

      // Eksekusi query dan ambil hasilnya
      const data = await query;

      // Jika data ditemukan, kembalikan hasilnya, jika tidak, kembalikan error atau null
      if (!data || data.length === 0) {
        throw new Error(`Data with id ${id} not found`);
      }

      return data[0]; // Mengembalikan hanya satu hasil
    } catch (error) {
      console.error('Error fetching record by ID:', error);
      throw new Error(
        error.message || 'An error occurred while fetching the record',
      );
    }
  }
  async create(data: any, trx: any = null, modifiedby: any) {
    data.modifiedby = modifiedby;
    const insertedItems = await trx(this.tableName).insert(data).returning('*');

    return insertedItems;
  }
  async approve(izinId: number, karyawanId: number, trx: any) {
    try {
      // Update statusapproval to 1 where izin_id and karyawan_id match
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'APPROVAL');
      const updated = await trx(this.tableName)
        .where('izin_id', izinId)
        .andWhere('karyawan_id', karyawanId)
        .update({
          statusapproval: dataParameter[0].id,
          tglapproval: trx.fn.now(), // Update the updated_at timestamp
          updated_at: trx.fn.now(), // Update the updated_at timestamp
        });

      const [{ count: totalApprovals }] = (await trx(this.tableName)
        .count('id as count')
        .where('izin_id', izinId)) as { count: number }[];

      const { jenjangapproval } = await trx(this.tableName)
        .select('jenjangapproval')
        .where('izin_id', izinId)
        .andWhere('karyawan_id', karyawanId)
        .first();
      if (jenjangapproval === totalApprovals) {
        await trx('izin')
          .update({ statusizin: dataParameter[0].id })
          .where('id', izinId);
      }
      const izin = await this.findIzinById(izinId, trx);

      const formattedTglPengajuan = formatEmailDate(izin.tglpengajuan);
      const formattedTglIzin = formatEmailDate(izin.tglizin);
      const pengaju = await this.karyawanService.findById(
        izin.karyawan_id,
        trx,
      );
      const atasanKaryawanId = await trx('izinapproval')
        .select('karyawan_id')
        .where('izin_id', izinId);
      const karyawanIds = atasanKaryawanId.map(
        (item: { karyawan_id: number }) => item.karyawan_id,
      );
      const emailAtasan = await trx('karyawan')
        .select('email')
        .whereIn('id', karyawanIds); // Using whereIn to get emails for multiple karyawan_id values
      const atasanEmails = emailAtasan.map((e) => e.email);
      const emailPengaju = pengaju.email;
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
      const allEmails = [
        ...atasanEmails, // Email atasan
        emailPengaju, // Email pengaju
        ...emails.map((to: any) => to.email), // toemailArray
      ];
      const uniqueCcEmails = ccEmails
        .map((cc: any) => cc.email) // Extract the emails from ccEmails
        .filter((ccEmail) => !allEmails.includes(ccEmail)); // Remove emails already in allEmails
      const uniqueRecipientEmails = [...new Set(allEmails)];

      const payload = {
        email: uniqueRecipientEmails,
        ccemail: uniqueCcEmails,
        name: pengaju.namakaryawan,
        jabatan: pengaju.jabatan_nama,
        alasanIzin: izin.alasanizin,
        namakaryawan: pengaju.namakaryawan,
        cabang: pengaju.cabang_nama,
        jamIzin: izin.jampengajuan,
        tglIzin: formattedTglIzin,
        tglPengajuan: formattedTglPengajuan,
        status: jenjangapproval < totalApprovals ? 'DIKONFIRMASI' : 'DISETUJUI',
        statussubject:
          jenjangapproval < totalApprovals ? '(DIKONFIRMASI)' : '(DISETUJUI)',
      };
      await this.mailService.sendEmailIzin(payload);
      return updated;
    } catch (error) {
      console.error('Error updating statusapproval:', error);
      throw error;
    }
  }
  async reject(izinId: number, karyawanId: number, trx: any) {
    try {
      // Update statusapproval to 2 where izin_id and karyawan_id match
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'DITOLAK');
      const updated = await trx(this.tableName)
        .where('izin_id', izinId)
        .update({
          statusapproval: dataParameter[0].id,
          tglapproval: trx.fn.now(), // Update the updated_at timestamp
          updated_at: trx.fn.now(), // Update the updated_at timestamp
        });
      const rejectIzin = await trx('izin').where('id', izinId).update({
        statusizin: dataParameter[0].id,
        updated_at: trx.fn.now(),
      });
      const izin = await trx('izin').select('*').where('id', izinId).first();
      const rawTglPengajuan = izin.tglpengajuan;
      const formattedTglPengajuan = formatEmailDate(rawTglPengajuan);
      const formattedTglIzin = formatEmailDate(izin.tglizin);
      const pengaju = await this.karyawanService.findById(
        izin.karyawan_id,
        trx,
      );

      const atasanKaryawanId = await trx('izinapproval')
        .select('karyawan_id')
        .where('izin_id', izinId);
      const karyawanIds = atasanKaryawanId.map(
        (item: { karyawan_id: number }) => item.karyawan_id,
      );
      const emailAtasan = await trx('karyawan')
        .select('email')
        .whereIn('id', karyawanIds); // Using whereIn to get emails for multiple karyawan_id values
      const atasanEmails = emailAtasan.map((e) => e.email);
      const emailPengaju = pengaju.email;
      const formattedJamIzin = new Date(izin.jampengajuan).toLocaleTimeString(
        'id-ID',
        { hour: '2-digit', minute: '2-digit' },
      );
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
      const allEmails = [
        ...atasanEmails, // Email atasan
        emailPengaju, // Email pengaju
        ...emails.map((to: any) => to.email), // toemailArray
      ];

      // Remove duplicates from the `ccemail` array that are already in `allEmails`
      const uniqueCcEmails = ccEmails
        .map((cc: any) => cc.email) // Extract the emails from ccEmails
        .filter((ccEmail) => !allEmails.includes(ccEmail)); // Remove emails already in allEmails
      const uniqueRecipientEmails = [...new Set(allEmails)];

      const payload = {
        email: uniqueRecipientEmails,
        ccemail: uniqueCcEmails,
        name: pengaju.namakaryawan,
        jabatan: pengaju.jabatan_nama,
        cabang: pengaju.cabang_nama,
        alasanIzin: izin.alasanizin,
        namakaryawan: pengaju.namakaryawan,
        jamIzin: formattedJamIzin,
        tglIzin: formattedTglIzin,
        tglPengajuan: formattedTglPengajuan,
        status: 'DITOLAK', // Marking status as Rejected
        statussubject: 'DITOLAK',
      };
      await this.mailService.sendEmailIzin(payload);

      return updated;
    } catch (error) {
      console.error('Error updating statusapproval:', error);
      throw error;
    }
  }

  findAll() {
    return `This action returns all izinapproval`;
  }

  findOne(id: number) {
    return `This action returns a #${id} izinapproval`;
  }

  update(id: number, updateIzinapprovalDto: UpdateIzinapprovalDto) {
    return `This action updates a #${id} izinapproval`;
  }

  remove(id: number) {
    return `This action removes a #${id} izinapproval`;
  }
}
