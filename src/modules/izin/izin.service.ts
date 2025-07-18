import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateIzinDto } from './dto/create-izin.dto';
import { UpdateIzinDto } from './dto/update-izin.dto';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { dbMssql } from 'src/common/utils/db';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import {
  convertToDateFormat,
  formatEmailDate,
  UtilsService,
} from 'src/utils/utils.service';
import { RedisService } from 'src/common/redis/redis.service';
import { Workbook } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { CutiapprovalService } from '../cutiapproval/cutiapproval.service';
import { KaryawanService } from '../karyawan/karyawan.service';
import { ApprovaldetailService } from '../approvaldetail/approvaldetail.service';
import { IzinapprovalService } from '../izinapproval/izinapproval.service';
import { MailService } from 'src/common/mail/mail.service';
@Injectable()
export class IzinService {
  private readonly tableName = 'izin';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
    private readonly izinApproval: IzinapprovalService,
    private readonly approvalDetailService: ApprovaldetailService,
    private readonly karyawanService: KaryawanService,
    private readonly mailService: MailService,
  ) {}
  async create(data: any, trx: any, modifiedby: any) {
    try {
      const currentTime = this.utilsService.getTime();
      data.updated_at = currentTime;
      data.tglpengajuan = currentTime;
      data.created_at = currentTime;
      data.modifiedby = modifiedby;
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'MENUNGGU');
      data.statusizin = dataParameter[0].id;

      if (data.jampengajuan) {
        // Jika waktu hanya dalam format HH:mm, tambahkan :00.0000000 untuk detik dan mikrodetik
        if (data.jampengajuan.length === 5) {
          data.jampengajuan = `${data.jampengajuan}:00.0000000`;
        }
        // Jika sudah ada detik, tambahkan mikrodetik .0000000
        else if (data.jampengajuan.length === 8) {
          data.jampengajuan = `${data.jampengajuan}.0000000`;
        }
      }

      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        jenisizin_nama,
        ...dataToCreate
      } = data;

      Object.keys(dataToCreate).forEach((key) => {
        if (typeof dataToCreate[key] === 'string') {
          dataToCreate[key] = dataToCreate[key].toUpperCase();
        }
      });
      let rawFilters: Record<string, any> = {};
      if (filters) {
        if (typeof filters === 'string') {
          try {
            rawFilters = JSON.parse(filters);
          } catch (err) {
            console.error('Gagal parse filters:', err);
            rawFilters = {};
          }
        } else {
          rawFilters = { ...filters };
        }
      }

      // 2. Paksa selalu ada karyawan_id di filterObj
      rawFilters.karyawan_id = data.karyawan_id;

      // 3. Gunakan filterObj di query nanti
      const filterObj = rawFilters;
      const insertedItems = await trx(this.tableName)
        .insert(dataToCreate)
        .returning('*');

      const newItem = insertedItems[0];
      const query = trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          trx.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
          trx.raw('CONVERT(VARCHAR(5), u.jampengajuan, 108) as jampengajuan'),
          'u.karyawan_id',
          trx.raw("FORMAT(u.tglizin, 'yyyy-MM-dd') as tglizin"),
          'u.statusizin',
          'u.statusizinbatal',
          'u.alasanizin',
          'u.jenisizin_id',
          'ji.nama as jenisizin_nama',

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
        .leftJoin('jenisizin as ji', 'u.jenisizin_id', 'ji.id')
        .leftJoin('parameter as p1', 'u.statusizin', 'p1.id')
        .leftJoin('parameter as p2', 'u.statusizinbatal', 'p2.id')
        .leftJoin('parameter as p3', 'u.jenisizin_id', 'p3.id')
        .orderBy(sortBy ? `u.${sortBy}` : 'u.id', sortDirection || 'desc');

      if (search) {
        const formattedSearch = search.trim();
        query.where((builder) => {
          builder
            .orWhere('u.id', 'like', `%${formattedSearch}%`)
            .orWhere('u.karyawan_id', 'like', `%${formattedSearch}%`)
            .orWhere(
              dbMssql.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') like ?", [
                `%${formattedSearch}%`,
              ]),
            ) // Format tanggal tglpengajuan untuk pencarian
            .orWhere(
              dbMssql.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') like ?", [
                `%${formattedSearch}%`,
              ]),
            ) // Format tanggal tglizin untuk pencarian
            .orWhere(
              dbMssql.raw('CONVERT(VARCHAR(5), u.jampengajuan, 108) like ?', [
                `%${formattedSearch}%`,
              ]),
            ) // Format jam untuk pencarian
            .orWhere('u.alasanizin', 'like', `%${formattedSearch}%`)
            .orWhere('k.namakaryawan', 'like', `%${formattedSearch}%`);
        });
      }

      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (
              key === 'statusizin_memo' ||
              key === 'statusizinbatal_memo' ||
              key === 'jenisizin_text'
            ) {
              query.andWhere(`p1.memo`, '=', value);
            } else if (key === 'karyawan_nama') {
              // Gunakan alias 'karyawan_nama' yang sudah didefinisikan dalam SELECT
              query.andWhere('k.namakaryawan', 'like', `%${value}%`);
            } else if (key === 'namaalias') {
              // Gunakan alias 'namaalias' yang sudah didefinisikan dalam SELECT
              query.andWhere('k.namaalias', 'like', `%${value}%`);
            } else if (key === 'tglpengajuan') {
              // Filter untuk tglpengajuan dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else if (key === 'jampengajuan') {
              // Filter untuk jampengajuan dengan format 'HH:mm'
              query.andWhereRaw(
                'CONVERT(VARCHAR(5), u.jampengajuan, 108) LIKE ?',
                [`%${value}%`],
              );
            } else if (key === 'tglizin') {
              // Filter untuk tglizin dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(u.tglizin, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else if (key === 'year') {
              // Filter untuk tglizin dengan format 'dd-MM-yyyy'
              query.andWhereRaw('YEAR(u.tglizin) = ?', [value]);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      const filteredItems = await query;
      let itemIndex = filteredItems.findIndex(
        (item) => Number(item.id) === Number(newItem.id),
      );

      if (itemIndex === -1) {
        itemIndex = 0;
      }

      const pageNumber = Math.floor(itemIndex / limit) + 1;
      const endIndex = pageNumber * limit;

      const limitedItems = filteredItems.slice(0, endIndex);

      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );
      const dataKaryawan = await this.karyawanService.findById(
        data.karyawan_id,
        trx,
      );
      const dataApproval = await this.approvalDetailService.findById(
        dataKaryawan.approval_id,
        trx,
      );
      if (dataKaryawan.approval_id) {
        const modifiedDataApproval = dataApproval.map(
          ({ namakaryawan, id, created_at, updated_at, ...rest }) => ({
            ...rest,
            izin_id: newItem.id,
            statusapproval: dataParameter[0].id, // Menambahkan statusapproval dengan nilai 0
            tglapproval: null,
            created_at: currentTime,
            updated_at: currentTime,
          }),
        );

        await this.izinApproval.create(modifiedDataApproval, trx, modifiedby);
      }

      const pengajuEmail = dataKaryawan.email;

      // 2. Dari dataApproval (hasil this.approvalDetailService.findById),
      //    ambil semua karyawan_id yang harus approve
      const supervisorIds = dataApproval.map((ad) => ad.karyawan_id);

      // 3. Query ke tabel karyawan untuk pluck email mereka
      const supervisorEmails: string[] = await trx('karyawan')
        .whereIn('id', supervisorIds)
        .pluck('email');
      const recipientEmails = [pengajuEmail, ...supervisorEmails];

      // 5. Format tanggal agar “Fri Apr 11 2025”
      const tglPengajuanFormatted = new Date(newItem.tglpengajuan);
      const tglPengajuanFormattedString = `${tglPengajuanFormatted.getDate().toString().padStart(2, '0')} ${tglPengajuanFormatted.toLocaleString('id-ID', { month: 'short' }).toUpperCase()} ${tglPengajuanFormatted.getFullYear()} ${tglPengajuanFormatted.getHours().toString().padStart(2, '0')}:${tglPengajuanFormatted.getMinutes().toString().padStart(2, '0')}:${tglPengajuanFormatted.getSeconds().toString().padStart(2, '0')}`;
      const formattedJamIzin = new Date(
        newItem.jampengajuan,
      ).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const tglIzinFormatted = new Date(newItem.tglizin);
      const tglIzinFormattedString = `${tglIzinFormatted.getDate().toString().padStart(2, '0')} ${tglIzinFormatted.toLocaleString('id-ID', { month: 'short' }).toUpperCase()} ${tglIzinFormatted.getFullYear()}`;
      // 6. Siapkan payload email
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
        namakaryawan: dataKaryawan.namakaryawan,
        cabang: dataKaryawan.cabang_nama,
        jabatan: dataKaryawan.jabatan_nama,
        alasanIzin: newItem.alasanizin,
        tglIzin: tglIzinFormattedString,
        jamIzin: formattedJamIzin, // sudah dalam format HH:mm
        tglPengajuan: tglPengajuanFormattedString,
        status: 'DIAJUKAN',
        statussubject: '(DIAJUKAN)',
      };
      await this.mailService.sendEmailIzin(payload);
      // Rest of the logic remains the same
      return {
        newItem,
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      throw new Error(`Error creating parameter: ${error.message}`);
    }
  }
  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;

      page = page ?? 1;
      limit = limit ?? 0;

      const offset = (page - 1) * limit;

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          dbMssql.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
          dbMssql.raw(
            'CONVERT(VARCHAR(5), u.jampengajuan, 108) as jampengajuan',
          ),
          'u.karyawan_id',
          dbMssql.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') as tglizin"),
          'u.statusizin',
          'p1.text as statusizin_text',
          'u.statusizinbatal',
          'u.alasanizin',
          'u.jenisizin_id',
          'ji.nama as jenisizin_nama',
          'u.statusapprovalatasan',
          dbMssql.raw(
            "FORMAT(u.tglapprovalatasan, 'dd-MM-yyyy') as tglapprovalatasan",
          ),
          'u.userapprovalatasan',
          'u.statusapprovalhrd',
          dbMssql.raw(
            "FORMAT(u.tglapprovalhrd, 'dd-MM-yyyy') as tglapprovalhrd",
          ),
          'u.userapprovalhrd',
          'u.info',
          'u.modifiedby',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'k.namakaryawan as karyawan_nama',
          'k.namaalias as namaalias',
          'p1.memo as statusizin_memo',
          'p2.memo as statusizinbatal_memo',
          'p3.text as jenisizin_text',
        ])
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .leftJoin('jenisizin as ji', 'u.jenisizin_id', 'ji.id')
        .leftJoin('parameter as p1', 'u.statusizin', 'p1.id')
        .leftJoin('parameter as p2', 'u.statusizinbatal', 'p2.id')
        .leftJoin('parameter as p3', 'u.jenisizin_id', 'p3.id');

      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      if (search) {
        const formattedSearch = search.trim();
        query.where((builder) => {
          builder
            .orWhere('u.id', 'like', `%${formattedSearch}%`)
            .orWhere('u.karyawan_id', 'like', `%${formattedSearch}%`)
            .orWhere(
              dbMssql.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') like ?", [
                `%${formattedSearch}%`,
              ]),
            ) // Format tanggal tglpengajuan untuk pencarian
            .orWhere(
              dbMssql.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') like ?", [
                `%${formattedSearch}%`,
              ]),
            ) // Format tanggal tglizin untuk pencarian
            .orWhere(
              dbMssql.raw('CONVERT(VARCHAR(5), u.jampengajuan, 108) like ?', [
                `%${formattedSearch}%`,
              ]),
            ) // Format jam untuk pencarian
            .orWhere('u.alasanizin', 'like', `%${formattedSearch}%`)
            .orWhere('k.namakaryawan', 'like', `%${formattedSearch}%`);
        });
      }

      if (filters) {
        if (filters.periodedari && filters.periodesampai) {
          // Mengonversi format dd-MM-yyyy ke yyyy-MM-dd
          const periodedariFormatted = convertToDateFormat(filters.periodedari);
          const periodesampaiFormatted = convertToDateFormat(
            filters.periodesampai,
          );

          // Menggunakan tanggal yang sudah terkonversi dalam query
          query.andWhereRaw('u.tglizin BETWEEN ? AND ?', [
            periodedariFormatted,
            periodesampaiFormatted,
          ]);
        }
        for (const [key, value] of Object.entries(filters)) {
          if (!value) continue;
          if (key === 'periodedari' || key === 'periodesampai') continue;
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (
              key === 'statusizin_memo' ||
              key === 'statusizinbatal_memo' ||
              key === 'jenisizin_text'
            ) {
              query.andWhere(`p1.memo`, '=', value);
            } else if (key === 'karyawan_nama') {
              // Gunakan alias 'karyawan_nama' yang sudah didefinisikan dalam SELECT
              query.andWhere('k.namakaryawan', 'like', `%${value}%`);
            } else if (key === 'namaalias') {
              // Gunakan alias 'namaalias' yang sudah didefinisikan dalam SELECT
              query.andWhere('k.namaalias', 'like', `%${value}%`);
            } else if (key === 'tglpengajuan') {
              // Filter untuk tglpengajuan dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else if (key === 'jampengajuan') {
              // Filter untuk jampengajuan dengan format 'HH:mm'
              query.andWhereRaw(
                'CONVERT(VARCHAR(5), u.jampengajuan, 108) LIKE ?',
                [`%${value}%`],
              );
            } else if (key === 'tglizin') {
              // Filter untuk tglizin dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(u.tglizin, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else if (key === 'year') {
              // Filter untuk tglizin dengan format 'dd-MM-yyyy'
              query.andWhereRaw('YEAR(u.tglizin) = ?', [value]);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      if (sort?.sortBy && sort?.sortDirection) {
        // Sorting based on the actual column (not the formatted string)
        if (sort.sortBy === 'tglpengajuan') {
          query.orderBy('u.tglpengajuan', sort.sortDirection);
        } else {
          query.orderBy(sort.sortBy, sort.sortDirection);
        }
      }

      const result = await dbMssql(this.tableName).count('id as total').first();
      const total = result?.total ? Number(result.total) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

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
      console.error('Error fetching records:', error);
      throw new Error(error);
    }
  }
  async findById(id: number, trx: any) {
    try {
      const query = trx(`${this.tableName} as u`)
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

  async findIzinApproval({
    search,
    filters,
    pagination,
    sort,
    karyawanId,
  }: FindAllParams) {
    try {
      let { page, limit } = pagination;

      page = page ?? 1;
      limit = limit ?? 0;

      const offset = (page - 1) * limit;
      const izinApprovalIds = await dbMssql('izinapproval')
        .select('izin_id')
        .modify((query) => {
          if (karyawanId !== undefined) {
            query.where(dbMssql.ref('karyawan_id'), '=', karyawanId);
          }
        });
      // Jika tidak ada cutiApproval yang ditemukan, kembalikan data kosong
      if (izinApprovalIds.length === 0) {
        return {
          data: [],
          total: 0,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
            itemsPerPage: 0,
          },
        };
      }

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          dbMssql.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
          dbMssql.raw(
            'CONVERT(VARCHAR(5), u.jampengajuan, 108) as jampengajuan',
          ),
          'u.karyawan_id',
          dbMssql.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') as tglizin"),
          'u.statusizin',
          'u.statusizinbatal',
          'u.alasanizin',
          'u.jenisizin_id',
          'u.statusapprovalatasan',
          'ji.nama as jenisizin_nama',

          dbMssql.raw(
            "FORMAT(u.tglapprovalatasan, 'dd-MM-yyyy') as tglapprovalatasan",
          ),
          'u.userapprovalatasan',
          'u.statusapprovalhrd',
          dbMssql.raw(
            "FORMAT(u.tglapprovalhrd, 'dd-MM-yyyy') as tglapprovalhrd",
          ),
          'u.userapprovalhrd',
          'u.info',
          'u.modifiedby',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'k.namakaryawan as karyawan_nama',
          'k.namaalias as namaalias',
          'p1.memo as statusizin_memo',
          'p2.memo as statusizinbatal_memo',
          'p3.text as jenisizin_text',
        ])
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .leftJoin('jenisizin as ji', 'u.jenisizin_id', 'ji.id')
        .leftJoin('parameter as p1', 'u.statusizin', 'p1.id')
        .leftJoin('parameter as p2', 'u.statusizinbatal', 'p2.id')
        .leftJoin('parameter as p3', 'u.jenisizin_id', 'p3.id')
        .whereIn(
          'u.id',
          izinApprovalIds.map((approval: any) => approval.izin_id),
        ); // Filter berdasarkan cuti_id dari cutiApproval

      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      if (search) {
        const formattedSearch = search.trim();

        query.where((builder) => {
          builder
            .orWhere('u.id', 'like', `%${formattedSearch}%`)
            .orWhere('u.karyawan_id', 'like', `%${formattedSearch}%`)
            .orWhere(
              dbMssql.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') like ?", [
                `%${formattedSearch}%`,
              ]),
            ) // Format tanggal tglpengajuan untuk pencarian
            .orWhere(
              dbMssql.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') like ?", [
                `%${formattedSearch}%`,
              ]),
            ) // Format tanggal tglizin untuk pencarian
            .orWhere(
              dbMssql.raw('CONVERT(VARCHAR(5), u.jampengajuan, 108) like ?', [
                `%${formattedSearch}%`,
              ]),
            ) // Format jam untuk pencarian
            .orWhere('u.alasanizin', 'like', `%${formattedSearch}%`)
            .orWhere('k.namakaryawan', 'like', `%${formattedSearch}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (
              key === 'statusizin_memo' ||
              key === 'statusizinbatal_memo' ||
              key === 'jenisizin_text'
            ) {
              query.andWhere(`p1.memo`, '=', value);
            } else if (key === 'karyawan_nama') {
              // Gunakan alias 'karyawan_nama' yang sudah didefinisikan dalam SELECT
              query.andWhere('k.namakaryawan', 'like', `%${value}%`);
            } else if (key === 'namaalias') {
              // Gunakan alias 'namaalias' yang sudah didefinisikan dalam SELECT
              query.andWhere('k.namaalias', 'like', `%${value}%`);
            } else if (key === 'tglpengajuan') {
              // Filter untuk tglpengajuan dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else if (key === 'jampengajuan') {
              // Filter untuk jampengajuan dengan format 'HH:mm'
              query.andWhereRaw(
                'CONVERT(VARCHAR(5), u.jampengajuan, 108) LIKE ?',
                [`%${value}%`],
              );
            } else if (key === 'tglizin') {
              // Filter untuk tglizin dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(u.tglizin, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      if (sort?.sortBy && sort?.sortDirection) {
        // Sorting based on the actual column (not the formatted string)
        if (sort.sortBy === 'tglpengajuan') {
          query.orderBy('u.tglpengajuan', sort.sortDirection);
        } else {
          query.orderBy(sort.sortBy, sort.sortDirection);
        }
      }
      const result = await dbMssql(this.tableName).count('id as total').first();
      const total = result?.total ? Number(result.total) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

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
      console.error('Error fetching records:', error);
      throw new Error(error);
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} izin`;
  }

  async update(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();
      if (!existingData) {
        throw new Error('Data not found');
      }
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        year,
        page,
        limit,
        jenisizin_nama,
        ...insertData
      } = data;
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);

      if (hasChanges) {
        insertData.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', id).update(insertData);
      }
      let rawFilters: Record<string, any> = {};
      if (filters) {
        if (typeof filters === 'string') {
          try {
            rawFilters = JSON.parse(filters);
          } catch (err) {
            console.error('Gagal parse filters:', err);
            rawFilters = {};
          }
        } else {
          rawFilters = { ...filters };
        }
      }

      // 2. Paksa selalu ada karyawan_id di filterObj
      rawFilters.karyawan_id = data.karyawan_id;

      // 3. Gunakan filterObj di query nanti
      const filterObj = rawFilters;
      const query = trx(`${this.tableName} as u`)
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
          'ji.nama as jenisizin_nama',

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
        .leftJoin('jenisizin as ji', 'u.jenisizin_id', 'ji.id')
        .leftJoin('parameter as p2', 'u.statusizinbatal', 'p2.id')
        .leftJoin('parameter as p3', 'u.jenisizin_id', 'p3.id');
      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (
              key === 'statusizin_memo' ||
              key === 'statusizinbatal_memo' ||
              key === 'jenisizin_text'
            ) {
              query.andWhere(`p1.memo`, '=', value);
            } else if (key === 'year') {
              // Filter untuk tglizin dengan format 'dd-MM-yyyy'
              query.andWhereRaw('YEAR(u.tglizin) = ?', [value]);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }
      if (sortBy && sortDirection) {
        // Sorting based on the actual column (not the formatted string)
        if (sortBy === 'tglpengajuan') {
          query.orderBy('u.tglpengajuan', sortDirection);
        } else {
          query.orderBy(sortBy, sortDirection);
        }
      }
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('u.id', 'like', `%${search}%`)
            .orWhere('u.karyawan_id', 'like', `%${search}%`)
            .orWhere('u.tglizin', 'like', `%${search}%`)
            .orWhere('u.alasanizin', 'like', `%${search}%`)
            .orWhere('k.nama', 'like', `%${search}%`)
            .orWhere('p3.text', 'like', `%${search}%`);
        });
      }
      const filteredItems = await query;
      let itemIndex = filteredItems.findIndex(
        (item) => Number(item.id) === Number(id),
      );
      if (itemIndex === -1) {
        itemIndex = 0;
      }
      const pageNumber = Math.floor(itemIndex / limit) + 1;
      const endIndex = pageNumber * limit;

      const limitedItems = filteredItems.slice(0, endIndex);

      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT IZIN',
          idtrans: id,
          nobuktitrans: id,
          aksi: 'EDIT',
          datajson: JSON.stringify(data),
          modifiedby: data.modifiedby,
        },
        trx,
      );
      return {
        newItem: {
          id,
          ...data,
        },
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      console.error('Error updating menu:', error);
      throw new Error('Failed to update menu');
    }
  }

  async delete(id: number, trx: any) {
    try {
      const deletedData = await this.utilsService.lockAndDestroy(
        id,
        this.tableName,
        'id',
        trx,
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'DELETE ERROR',
          idtrans: deletedData.id,
          nobuktitrans: deletedData.id,
          aksi: 'DELETE',
          datajson: JSON.stringify(deletedData),
          modifiedby: deletedData.modifiedby,
        },
        trx,
      );

      return { status: 200, message: 'Data deleted successfully', deletedData };
    } catch (error) {
      console.error('Error deleting data:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete data');
    }
  }
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

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          dbMssql.raw("FORMAT(u.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
          dbMssql.raw(
            'CONVERT(VARCHAR(5), u.jampengajuan, 108) as jampengajuan',
          ),
          'u.karyawan_id',
          dbMssql.raw("FORMAT(u.tglizin, 'dd-MM-yyyy') as tglizin"),
          'u.statusizin',
          'p1.text as statusizin_text',
          'u.statusizinbatal',
          'u.alasanizin',
          'u.jenisizin_id',
          'u.statusapprovalatasan',
          'u.tglapprovalatasan',
          'u.userapprovalatasan',
          'u.statusapprovalhrd',
          'u.tglapprovalhrd',
          'u.userapprovalhrd',
          'u.info',
          'u.modifiedby',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
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
        .join(dbMssql.raw(`${tempData} as temp`), 'u.id', 'temp.id')
        .orderBy('U.tglpengajuan', 'ASC');

      const data = await query;

      const dropTempTableQuery = `DROP TABLE ${tempData};`;
      await dbMssql.raw(dropTempTableQuery);

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }

  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    // Header export
    worksheet.mergeCells('A1:G1');
    worksheet.mergeCells('A2:G2');
    worksheet.mergeCells('A3:G3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN IZIN';
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

    // Defining headers
    const headers = [
      'No.',
      'TGL PENGAJUAN',
      'KARYAWAN',
      'STATUS IZIN',
      'ALASAN IZIN',
      'MODIFIED BY',
      'CREATED AT',
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

    // Filling data into Excel with row index as ID
    data.forEach((row, rowIndex) => {
      worksheet.getCell(rowIndex + 6, 1).value = rowIndex + 1; // Row number (ID)
      worksheet.getCell(rowIndex + 6, 2).value = row.tglpengajuan;
      worksheet.getCell(rowIndex + 6, 3).value = row.karyawan_nama;
      worksheet.getCell(rowIndex + 6, 4).value = row.statusizin_text;
      worksheet.getCell(rowIndex + 6, 5).value = row.alasanizin;
      worksheet.getCell(rowIndex + 6, 6).value = row.modifiedby;
      worksheet.getCell(rowIndex + 6, 7).value = row.created_at;

      // Adding borders for each cell
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
    });

    // Adjusting column width
    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 30;

    // Save the file in a temporary directory
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_izin_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  async rekapIzinData(
    idcabang: number,
    tanggalDari: string,
    tanggalSampai: string,
    trx: any,
  ): Promise<any[]> {
    try {
      // Validasi format tanggal, pastikan tanggal dalam format ISO 8601 (YYYY-MM-DD)
      const startDate = `${tanggalDari}T00:00:00.000Z`; // Waktu mulai dari tanggalDari (pukul 00:00)
      const endDate = `${tanggalSampai}T23:59:59.999Z`; // Waktu selesai di tanggalSampai (pukul 23:59)
      const Tempdata1 =
        '##Tempdata1' + Math.random().toString(36).substring(2, 8);
      await trx.schema.createTable(Tempdata1, (t) => {
        t.integer('karyawan_id');
        t.integer('jumlah');
      });
      await trx(Tempdata1).insert(
        trx
          .select('a.karyawan_id as karyawan_id')
          .count('a.karyawan_id as jumlah') // Menggunakan count untuk menghitung jumlah
          .from('izin AS a')
          .innerJoin('izinapproval AS b', 'a.id', 'b.izin_id') // Menambahkan join dengan kondisi yang benar
          .where('a.tglizin', '>=', trx.raw('?', [startDate])) // Parameter untuk tanggal mulai
          .andWhere('a.tglizin', '<=', trx.raw('?', [endDate])) // Parameter untuk tanggal akhir
          .andWhere(trx.raw('ISNULL(b.statusapproval, 0) = 151')) // Pengecekan statusapproval
          .groupBy('a.karyawan_id'),
      );

      const dateTempData = await trx(Tempdata1);

      // 1. Ambil data awal sesuai query dan hitung urutan (furut)

      const result = await trx
        .select(
          'b.namakaryawan',
          trx.raw('ISNULL(c.nama, ?) AS jabatan', ['']), // Use ? for parameterized query instead of empty string alias
          'b.tglmasukkerja',
          'a.jumlah',
        )
        .from(`${Tempdata1} as a`)
        .innerJoin('karyawan as b', 'a.karyawan_id', 'b.id')
        .leftJoin('jabatan as c', 'b.jabatan_id', 'c.id')
        .where('b.cabang_id', '=', idcabang); // Ensure that pcabang_id is defined in your context

      return result;
    } catch (error) {
      console.error('Error in rekap izin:', error);
      throw new InternalServerErrorException(
        `Error rekap izin data: ${error.message}`,
      );
    }
  }
  async cancel(izinId: number, trx: any) {
    try {
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'DIBATALKAN');
      const updated = await trx(this.tableName).where('id', izinId).update({
        statusizinbatal: dataParameter[0].id,
        statusizin: dataParameter[0].id,
        updated_at: trx.fn.now(),
      });
      await this.izinApproval.updateApprovalStatus(izinId, trx);

      return updated;
    } catch (error) {
      console.error('Error updating statusizin:', error);
      throw error;
    }
  }
  async exportToExcelRekap(data) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:E1');
    worksheet.mergeCells('A2:E2');
    worksheet.mergeCells('A3:E3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN IZIN KARYAWAN';
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

    // Adjust headers to match the keys in the data
    const headers = ['NO.', 'NAMA', 'JABATAN', 'TANGGAL MASUK KERJA', 'JUMLAH'];

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

    // Loop to populate the data in the respective columns
    data.forEach((row, rowIndex) => {
      const currentRow = rowIndex + 6;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1;
      worksheet.getCell(currentRow, 2).value = row.namakaryawan; // 'Karyawan' key
      worksheet.getCell(currentRow, 3).value = row.jabatan; // 'tglpengajuan' key
      worksheet.getCell(currentRow, 4).value = row.tglmasukkerja; // 'alasancuti' key
      worksheet.getCell(currentRow, 5).value = row.jumlah;

      // Set the date format for TGL CUTI
      worksheet.getCell(currentRow, 4).numFmt = 'DD-MM-YYYY';

      for (let col = 1; col <= headers.length; col++) {
        const cell = worksheet.getCell(currentRow, col);
        cell.font = { name: 'Tahoma', size: 10 };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });

    // Set column widths based on the content
    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 15;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_izin_karyawan_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }
}
