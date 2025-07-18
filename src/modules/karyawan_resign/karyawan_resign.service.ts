import { Inject, Injectable } from '@nestjs/common';
import { CreateKaryawanResignDto } from './dto/create-karyawan_resign.dto';
import { UpdateKaryawanResignDto } from './dto/update-karyawan_resign.dto';
import { dbMssql } from 'src/common/utils/db';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { RedisService } from 'src/common/redis/redis.service';
import { formatEmailDate, UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { MailService } from 'src/common/mail/mail.service';
import { KaryawanService } from '../karyawan/karyawan.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { ClientProxy } from '@nestjs/microservices';
import path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcrypt';
import { Workbook } from 'exceljs';
@Injectable()
export class KaryawanResignService {
  private readonly tableName: string = 'karyawan';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
    private readonly mailService: MailService,
    private readonly karyawanService: KaryawanService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;
      // Default values for page and limit
      page = page ?? 1;
      if (limit == null) {
        limit = 0;
      }

      // kalau limit=0 → ubah ke MAX_SAFE_INTEGER supaya query.limit(…) tetap memuat semua baris
      if (limit === 0) {
        limit = Number.MAX_SAFE_INTEGER;
      }
      const offset = (page - 1) * limit;

      const query = dbMssql(this.tableName + ' as k')
        .select([
          'k.id as id',
          'k.npwp',
          'k.namakaryawan',
          'k.namaalias',
          'k.jeniskelamin_id',
          'k.alamat',
          'k.tempatlahir',
          'k.nohp',
          'k.agama_id',
          'k.statuskerja_id',
          'k.statuskaryawan_id',
          'k.jumlahtanggungan',
          'k.noktp',
          'k.golongandarah_id',
          'k.cabang_id',
          'k.jabatan_id',
          'k.atasan_id',
          'k.thr_id',
          'k.daftaremail_id',
          'k.approval_id',
          'k.kodemarketing',
          'k.alasanberhenti',
          'k.statusaktif',
          'k.email',
          'k.namaibu',
          'k.namaayah',
          'k.foto',
          'k.pengalamankerja',
          'k.modifiedby',
          dbMssql.raw("FORMAT(k.tgllahir, 'dd-MM-yyyy') as tgllahir"),
          dbMssql.raw("FORMAT(k.tglmasukkerja, 'dd-MM-yyyy') as tglmasukkerja"),
          dbMssql.raw("FORMAT(k.tglresign, 'dd-MM-yyyy') as tglresign"),
          dbMssql.raw("FORMAT(k.tglmutasi, 'dd-MM-yyyy') as tglmutasi"),
          'k.kodekaryawan',
          'k.keterangan',
          dbMssql.raw(
            "FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
          // Kolom dari join tabel parameter
          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',
          // Kolom dari join tabel lain
          'a.nama as approval_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          dbMssql.raw(
            "COALESCE(CONCAT(atasan.namakaryawan, ' (', atasan.id, ')'), 'Tidak ada') as atasan_nama",
          ),
          'thr.text as thr_text',
          dbMssql.raw(
            "COALESCE(de.nama, 'Tidak ada email') as daftaremail_email",
          ),
        ])
        .leftJoin('parameter as p1', 'k.statusaktif', 'p1.id')
        .leftJoin('parameter as p2', 'k.statuskerja_id', 'p2.id')
        .leftJoin('parameter as p3', 'k.statuskaryawan_id', 'p3.id')
        .leftJoin('parameter as p4', 'k.jeniskelamin_id', 'p4.id')
        .leftJoin('parameter as p5', 'k.golongandarah_id', 'p5.id')
        .leftJoin('parameter as p6', 'k.agama_id', 'p6.id')
        .leftJoin('approvalheader as a', 'k.approval_id', 'a.id')
        .leftJoin('cabang as c', 'k.cabang_id', 'c.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id') // Left leftJoin untuk atasan karyawan
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id') // Left join untuk email karyawan
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id')
        .whereNotNull('k.tglresign');

      // Pagination logic
      query.limit(limit).offset(offset);

      // Search functionality (hanya untuk field yang ada di SELECT)
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('k.npwp', 'like', `%${search}%`)
            .orWhere('k.namakaryawan', 'like', `%${search}%`)
            .orWhere('k.namaalias', 'like', `%${search}%`)
            .orWhere('k.alamat', 'like', `%${search}%`)
            .orWhere('k.nohp', 'like', `%${search}%`)
            .orWhere('p1.memo', 'like', `%${search}%`)
            .orWhere('p1.text', 'like', `%${search}%`)
            .orWhere('c.nama', 'like', `%${search}%`)
            .orWhere('j.nama', 'like', `%${search}%`)
            .orWhere('de.nama', 'like', `%${search}%`);
        });
      }

      // Filters logic
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(k.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'memo' || key === 'text') {
              query.andWhere(`p1.${key}`, '=', value);
            } else if (
              key === 'statusaktif_memo' ||
              key === 'statuskerja_memo' ||
              key === 'statuskaryawan_memo'
            ) {
              query.andWhere(`p1.memo`, 'like', `%${value}%`);
            } else if (key === 'atasan_nama') {
              query.andWhereRaw(
                "CONCAT(atasan.namakaryawan, ' (', atasan.id, ')') LIKE ?",
                [`%${value}%`],
              );
            } else {
              query.andWhere(`k.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      // Sorting logic
      if (sort?.sortBy && sort?.sortDirection) {
        query.orderBy(sort.sortBy, sort.sortDirection);
      }

      const result = await dbMssql(this.tableName + ' as k')
        .whereNotNull('k.tglresign')
        .count('id as total')
        .first();

      const total = result?.total ? Number(result.total) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

      // Fetch the data
      const data = await query;

      return {
        data,
        total,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalItems: total,
          itemsPerPage: limit > 0 ? limit : total,
        },
      };
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error(error);
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} karyawanResign`;
  }
  formatDateToCustomFormat(dateString: string): string {
    // Memecah tanggal dengan separator '-'
    const [day, month, year] = dateString.split('-');

    // Membuat objek Date dengan format yang dikenali oleh JavaScript: dd-MM-yyyy
    const date = new Date(`${year}-${month}-${day}`);

    // Cek apakah formatnya valid
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }

    const dayFormatted = date.getDate().toString().padStart(2, '0');
    const monthFormatted = date
      .toLocaleString('id-ID', { month: 'short' })
      .toUpperCase();
    const yearFormatted = date.getFullYear();

    return `${dayFormatted} ${monthFormatted} ${yearFormatted}`;
  }

  async create(data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName)
        .where('id', data.karyawan_id)
        .first();

      if (!existingData) {
        throw new Error('Data not found');
      }
      if (data.tglresign) {
        // Ubah format tglresign ke format yang diterima database (dd-MM-yyyy)
        const tglizinFormatted = new Date(
          data.tglresign.split('-').reverse().join('-'),
        ); // Ubah dari DD-MM-YYYY menjadi dd-MM-yyyy
        data.tglresign = tglizinFormatted.toISOString().split('T')[0]; // 'dd-MM-yyyy'
      }
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        karyawan_id,
        kodeCabang,
        ...insertData
      } = data;

      const dataKaryawan = await this.karyawanService.findById(
        karyawan_id,
        trx,
      );
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);
      if (hasChanges) {
        insertData.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', karyawan_id).update(insertData);
      }
      const karyawan = await trx(this.tableName)
        .select('daftaremail_id')
        .where('id', karyawan_id)
        .first();

      if (!karyawan || !karyawan.daftaremail_id) {
        throw new Error('No daftaremail_id found for the resigning employee');
      }
      const emailDetails = await trx('daftaremailtodetail')
        .select('toemail_id')
        .where('daftaremail_id', karyawan.daftaremail_id);

      if (!emailDetails || emailDetails.length === 0) {
        throw new Error('No email details found for the resigning employee');
      }

      // Mendapatkan email berdasarkan toemail_id
      const emails = await trx('toemail')
        .select('email', 'nama')
        .whereIn(
          'id',
          emailDetails.map((detail: any) => detail.toemail_id),
        );
      if (!emails || emails.length === 0) {
        throw new Error('No emails found for the resigning employee');
      }
      const ccEmailsData = await trx('daftaremailccdetail')
        .select('ccemail_id')
        .where('daftaremail_id', karyawan.daftaremail_id);

      // Fetch actual email addresses from `ccemail` table
      const ccEmails = await trx('ccemail')
        .select('email')
        .whereIn(
          'id',
          ccEmailsData.map((cc: any) => cc.ccemail_id),
        );

      const ccemailArray = ccEmails.map((cc: any) => cc.email);
      const toemailArray = emails.map((to: any) => to.email);
      // Format tglinput as "20 APR 2025 21:29:26"
      const tglInputFormatted = new Date(insertData.updated_at);
      const tglInputFormattedString = `${tglInputFormatted.getDate().toString().padStart(2, '0')} ${tglInputFormatted.toLocaleString('id-ID', { month: 'short' }).toUpperCase()} ${tglInputFormatted.getFullYear()} ${tglInputFormatted.getHours().toString().padStart(2, '0')}:${tglInputFormatted.getMinutes().toString().padStart(2, '0')}:${tglInputFormatted.getSeconds().toString().padStart(2, '0')}`;

      // Format tglmasukkerja to "01 APR 2025"

      const formattedTglMasukKerja = this.formatDateToCustomFormat(
        dataKaryawan.tglmasukkerja,
      );

      const tglResignFormatted = new Date(insertData.tglresign);
      const tglResignFormattedString = `${tglResignFormatted.getDate().toString().padStart(2, '0')} ${tglResignFormatted.toLocaleString('id-ID', { month: 'short' }).toUpperCase()} ${tglResignFormatted.getFullYear()}`;

      await this.mailService.emailKaryawanResign({
        email: toemailArray,
        ccemail: ccemailArray,
        namakaryawan: dataKaryawan.namakaryawan,
        alamat: dataKaryawan.alamat,
        gender: dataKaryawan.jeniskelamin_text,
        jabatan: dataKaryawan.jabatan_nama,
        foto: dataKaryawan?.foto
          ? `https://hrapi.transporindo.com/uploads/${dataKaryawan?.foto?.toLowerCase()}`
          : '',
        cabang: dataKaryawan.cabang_nama,
        tglmasukkerja: formattedTglMasukKerja, // Formatted tglmasukkerja
        tglresign: tglResignFormattedString, // Formatted tglmasukkerja
        alasanresign: insertData.alasanberhenti, // Formatted tglmasukkerja
        username: insertData.modifiedby,
        tglinput: tglInputFormattedString, // Formatted tglinput with time
      });

      const query = trx(this.tableName + ' as k')
        .select([
          'k.id as id',
          'k.npwp',
          'k.namakaryawan',
          'k.namaalias',
          'k.jeniskelamin_id',
          'k.alamat',
          'k.tempatlahir',
          'k.nohp',
          'k.agama_id',
          'k.statuskerja_id',
          'k.statuskaryawan_id',
          'k.jumlahtanggungan',
          'k.noktp',
          'k.golongandarah_id',
          'k.cabang_id',
          'k.jabatan_id',
          'k.atasan_id',
          'k.thr_id',
          'k.daftaremail_id',
          'k.approval_id',
          'k.kodemarketing',
          'k.alasanberhenti',
          'k.statusaktif',
          'k.email',
          'k.namaibu',
          'k.namaayah',
          'k.foto',
          'k.pengalamankerja',
          'k.modifiedby',
          dbMssql.raw("FORMAT(k.tgllahir, 'dd-MM-yyyy') as tgllahir"),
          dbMssql.raw("FORMAT(k.tglmasukkerja, 'dd-MM-yyyy') as tglmasukkerja"),
          dbMssql.raw("FORMAT(k.tglresign, 'dd-MM-yyyy') as tglresign"),
          dbMssql.raw("FORMAT(k.tglmutasi, 'dd-MM-yyyy') as tglmutasi"),
          'k.kodekaryawan',
          'k.keterangan',
          dbMssql.raw(
            "FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
          // Kolom dari join tabel parameter
          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',
          // Kolom dari join tabel lain
          'a.nama as approval_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          dbMssql.raw(
            "COALESCE(CONCAT(atasan.namakaryawan, ' (', atasan.id, ')'), 'Tidak ada') as atasan_nama",
          ),
          'thr.text as thr_text',
          dbMssql.raw(
            "COALESCE(de.nama, 'Tidak ada email') as daftaremail_email",
          ),
        ])
        .leftJoin('parameter as p1', 'k.statusaktif', 'p1.id')
        .leftJoin('parameter as p2', 'k.statuskerja_id', 'p2.id')
        .leftJoin('parameter as p3', 'k.statuskaryawan_id', 'p3.id')
        .leftJoin('parameter as p4', 'k.jeniskelamin_id', 'p4.id')
        .leftJoin('parameter as p5', 'k.golongandarah_id', 'p5.id')
        .leftJoin('parameter as p6', 'k.agama_id', 'p6.id')
        .leftJoin('approvalheader as a', 'k.approval_id', 'a.id')
        .leftJoin('cabang as c', 'k.cabang_id', 'c.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id')
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id')
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id')
        .orderBy(sortBy ? `k.${sortBy}` : 'k.id', sortDirection || 'desc')
        .whereNotNull('k.tglresign')
        .where('k.id', '<=', karyawan_id);

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(m.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`m.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      // Bagian search disesuaikan dengan field yang di-select
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('k.namakaryawan', 'like', `%${search}%`)
            .orWhere('k.namaalias', 'like', `%${search}%`)
            .orWhere('k.npwp', 'like', `%${search}%`)
            .orWhere('k.alamat', 'like', `%${search}%`)
            .orWhere('k.tempatlahir', 'like', `%${search}%`)
            .orWhere('k.nohp', 'like', `%${search}%`)
            .orWhere('k.email', 'like', `%${search}%`)
            .orWhere('k.kodekaryawan', 'like', `%${search}%`)
            .orWhere('k.keterangan', 'like', `%${search}%`)
            .orWhere('p1.text', 'like', `%${search}%`)
            .orWhere('p1.memo', 'like', `%${search}%`)
            .orWhere('p2.text', 'like', `%${search}%`)
            .orWhere('p3.text', 'like', `%${search}%`)
            .orWhere('p4.text', 'like', `%${search}%`)
            .orWhere('p5.text', 'like', `%${search}%`)
            .orWhere('p6.text', 'like', `%${search}%`)
            .orWhere('a.nama', 'like', `%${search}%`)
            .orWhere('c.nama', 'like', `%${search}%`)
            .orWhere('j.nama', 'like', `%${search}%`);
        });
      }

      // Ambil hasil query yang terfilter
      const filteredItems = await query;
      // Cari index item baru di hasil yang sudah difilter
      let itemIndex = filteredItems.findIndex(
        (item) => Number(item.id) === Number(karyawan_id),
      );

      if (itemIndex === -1) {
        itemIndex = 0;
      }

      const pageNumber = Math.floor(itemIndex / limit) + 1;
      const endIndex = pageNumber * limit;

      // Ambil insertData hingga halaman yang mencakup item baru
      const limitedItems = filteredItems.slice(0, endIndex);
      // Simpan ke Redis
      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT KARYAWAN',
          idtrans: karyawan_id,
          nobuktitrans: karyawan_id,
          aksi: 'EDIT',
          datajson: JSON.stringify(insertData),
          modifiedby: insertData.modifiedby,
        },
        trx,
      );
      return {
        newItem: {
          ...insertData,
        },
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      console.error('Error updating menu:', error);
      throw new Error('Failed to update menu');
    }
  }
  // async create(payload: any) {
  //   try {
  //     // Mengirimkan pesan ke RabbitMQ untuk nonaktifkan akun
  //     const response = await this.rabbitmqService.client
  //       .send({ cmd: 'nonaktif_akun' }, payload)
  //       .toPromise();

  //     // Jika response undefined atau tidak ada, lemparkan error
  //     if (!response || response === undefined) {
  //       throw new Error('Response from client is undefined or invalid');
  //     }

  //     //     // Pastikan kita hanya commit jika client mengirimkan status success
  //     if (response.status === 'success') {
  //       return { status: 'success', message: 'Karyawan resign berhasil' };
  //     } else {
  //       return { status: 'error', message: 'Gagal menonaktifkan akun' };
  //     }
  //   } catch (error) {
  //     // Tangani error (termasuk timeout atau kesalahan lainnya)
  //     return { status: 'error', message: error.message };
  //   }
  // }

  async findAllByIds(ids: { id: number }[]) {
    try {
      const idList = ids.map((item) => item.id);
      const tempData = `##temp_${Math.random().toString(36).substring(2, 15)}`;

      const createTempTableQuery = `
        CREATE TABLE ${tempData} (
          id INT
        );
      `;
      await dbMssql.raw(createTempTableQuery);

      const insertTempTableQuery = `
        INSERT INTO ${tempData} (id)
        VALUES ${idList.map((id) => `(${id})`).join(', ')};
      `;
      await dbMssql.raw(insertTempTableQuery);

      const query = dbMssql(`${this.tableName} as k`)
        .select([
          'k.id as id',
          'k.npwp',
          'k.namakaryawan',
          'k.namaalias',
          'k.jeniskelamin_id',
          'k.alamat',
          'k.tempatlahir',
          'k.nohp',
          'k.agama_id',
          'k.statuskerja_id',
          'k.statuskaryawan_id',
          'k.jumlahtanggungan',
          'k.noktp',
          'k.golongandarah_id',
          'k.cabang_id',
          'k.jabatan_id',
          'k.atasan_id',
          'k.thr_id',
          'k.daftaremail_id',
          'k.approval_id',
          'k.kodemarketing',
          'k.alasanberhenti',
          'k.statusaktif',
          'k.email',
          'k.namaibu',
          'k.namaayah',
          'k.foto',
          'k.pengalamankerja',
          'k.modifiedby',
          dbMssql.raw("FORMAT(k.tgllahir, 'dd-MM-yyyy') as tgllahir"),
          dbMssql.raw("FORMAT(k.tglmasukkerja, 'dd-MM-yyyy') as tglmasukkerja"),
          dbMssql.raw("FORMAT(k.tglresign, 'dd-MM-yyyy') as tglresign"),
          dbMssql.raw("FORMAT(k.tglmutasi, 'dd-MM-yyyy') as tglmutasi"),
          'k.kodekaryawan',
          'k.keterangan',
          dbMssql.raw(
            "FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
          // Kolom dari join tabel parameter
          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',
          // Kolom dari join tabel lain
          'a.nama as approval_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          dbMssql.raw(
            "COALESCE(CONCAT(atasan.namakaryawan, ' (', atasan.id, ')'), 'Tidak ada') as atasan_nama",
          ),
          'thr.text as thr_text',
          dbMssql.raw(
            "COALESCE(de.nama, 'Tidak ada email') as daftaremail_email",
          ),
        ])
        .leftJoin('parameter as p1', 'k.statusaktif', 'p1.id')
        .leftJoin('parameter as p2', 'k.statuskerja_id', 'p2.id')
        .leftJoin('parameter as p3', 'k.statuskaryawan_id', 'p3.id')
        .leftJoin('parameter as p4', 'k.jeniskelamin_id', 'p4.id')
        .leftJoin('parameter as p5', 'k.golongandarah_id', 'p5.id')
        .leftJoin('parameter as p6', 'k.agama_id', 'p6.id')
        .leftJoin('approvalheader as a', 'k.approval_id', 'a.id')
        .leftJoin('cabang as c', 'k.cabang_id', 'c.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id') // Left leftJoin untuk atasan karyawan
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id') // Left leftJoin untuk email karyawan
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id')
        .whereIn('k.id', idList)
        .whereNotNull('k.tglresign')

        .orderBy('k.namakaryawan', 'ASC');

      const data = await query;

      const dropTempTableQuery = `DROP TABLE ${tempData};`;
      await dbMssql.raw(dropTempTableQuery);

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }
  remove(id: number) {
    return `This action removes a #${id} karyawanResign`;
  }
  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:F1');
    worksheet.mergeCells('A2:F2');
    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN KARYAWAN RESIGN';
    worksheet.getCell('A3').value = 'Data Export';
    worksheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A2').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A3').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A1').font = { size: 14, bold: true };
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('A3').font = { bold: true };

    const headers = [
      'No.',
      'KODE',
      'NAMA KARYAWAN',
      'ALAMAT',
      'NO. HP',
      'EMAIL',
      'TGL RESIGN',
      'CREATED AT',
      'UPDATED AT',
    ];
    headers.forEach((header, index) => {
      const cell = worksheet.getCell(5, index + 1);
      cell.value = header;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF00' },
      };
      cell.font = { bold: true, name: 'Tahoma', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    data.forEach((row, rowIndex) => {
      worksheet.getCell(rowIndex + 6, 1).value = rowIndex + 1;
      worksheet.getCell(rowIndex + 6, 2).value = row.kodekaryawan;
      worksheet.getCell(rowIndex + 6, 3).value = row.namakaryawan;
      worksheet.getCell(rowIndex + 6, 4).value = row.alamat;
      worksheet.getCell(rowIndex + 6, 5).value = row.nohp;
      worksheet.getCell(rowIndex + 6, 6).value = row.email;
      worksheet.getCell(rowIndex + 6, 7).value = row.tglresign;
      worksheet.getCell(rowIndex + 6, 8).value = row.created_at;
      worksheet.getCell(rowIndex + 6, 9).value = row.updated_at;

      for (let col = 1; col <= headers.length; col++) {
        const cell = worksheet.getCell(rowIndex + 6, col);
        cell.font = { name: 'Tahoma', size: 10 };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }

      const progress = Math.round(((rowIndex + 1) / data.length) * 100);
    });

    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 30;
    worksheet.getColumn(8).width = 30;
    worksheet.getColumn(9).width = 30;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_karyawan_resign${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }
}
