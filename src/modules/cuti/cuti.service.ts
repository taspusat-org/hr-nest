import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { dbMssql } from 'src/common/utils/db';
import { RedisService } from 'src/common/redis/redis.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import {
  convertToDateFormat,
  formatEmailDate,
  UtilsService,
} from 'src/utils/utils.service';
import { CutidetailService } from '../cutidetail/cutidetail.service';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import * as fs from 'fs';
import * as path from 'path';
import { Workbook } from 'exceljs';
import { ApprovaldetailService } from '../approvaldetail/approvaldetail.service';
import { KaryawanService } from '../karyawan/karyawan.service';
import { CutiapprovalService } from '../cutiapproval/cutiapproval.service';
import { Knex } from 'knex';
import { MailService } from 'src/common/mail/mail.service';
import { ParameterService } from '../parameter/parameter.service';
@Injectable()
export class CutiService {
  private readonly tableName: string = 'cuti';

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    @Inject('KNEX_CONNECTION') private readonly knex: Knex,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
    private readonly detailService: CutidetailService,
    private readonly approvalDetailService: ApprovaldetailService,
    private readonly karyawanService: KaryawanService,
    private readonly cutiApproval: CutiapprovalService,
    private readonly parameterService: ParameterService,
    private readonly mailService: MailService,
  ) {}

  async create(data: any, trx: any, modifiedby: any) {
    try {
      const currentTime = this.utilsService.getTime();
      data.updated_at = currentTime;
      data.created_at = currentTime;
      data.tglpengajuan = currentTime;
      data.modifiedby = modifiedby;
      data.statusnonhitung = 150;
      const dataKaryawan = await this.karyawanService.findById(
        data.karyawan_id,
        trx,
      );
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'MENUNGGU');

      if (dataKaryawan.approval_id) {
        data.approval_id = dataKaryawan.approval_id;
        data.statuscuti = dataParameter[0].id;
      } else {
        const dataParameterApprove = await trx('parameter')
          .where('grp', 'STATUS APPROVAL')
          .andWhere('text', 'APPROVAL');
        data.statusapprovalatasan = dataParameterApprove[0].id;
        data.statusapprovalhrd = dataParameterApprove[0].id;
        data.statuscuti = dataParameterApprove[0].id;
      }
      const {
        detailCuti,
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        year,
        limit,
        ...dataToCreate
      } = data;
      let parsedDetailCuti: any[] = [];
      if (detailCuti) {
        if (Array.isArray(detailCuti)) {
          parsedDetailCuti = detailCuti.map((item) =>
            typeof item === 'string' ? JSON.parse(item) : item,
          );
        } else if (typeof detailCuti === 'string') {
          parsedDetailCuti = JSON.parse(detailCuti);
        }
      }

      if (!dataKaryawan.approval_id) {
        throw new Error(
          `Tidak bisa mengajukan cuti, karena tidak memiliki jenjang approval`,
        );
      }
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
      rawFilters.statuscuti = data.statuscuti;
      // 3. Gunakan filterObj di query nanti
      const filterObj = rawFilters;
      // Calculate jumlahcuti based on the length of the detailCuti array

      // Set jumlahcuti based on the parsedDetailCuti length
      dataToCreate.jumlahcuti = parsedDetailCuti.length;

      // Insert the data into the cuti table
      const insertedItems = await trx(this.tableName)
        .insert(dataToCreate)
        .returning('*');
      const newItem = insertedItems[0];
      const datatempJatahCutiHasil2 = await this.karyawanService.rekapCuti(
        String(data.karyawan_id || ''),
        0,
        trx,
      );
      const query = trx(`${this.tableName} as c`)
        .select([
          'c.id as id',
          trx.raw("FORMAT(c.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"), // Untuk tampilan
          'c.karyawan_id',
          'k.namakaryawan as namakaryawan',
          'k.namaalias as namaalias',
          'c.tglcuti',
          'c.statuscuti',
          'p.memo as statuscuti_memo',
          'c.statuscutibatal',
          'b.memo as statuscutibatal_memo',
          'c.nohp',
          'c.alasanpenolakan',
          'c.alasancuti',
          'c.jumlahcuti',
          'c.kategoricuti_id',
          'cat.memo as kategoricuti_memo',
          'c.statusnonhitung',
          'sh.memo as statusnonhitung_memo',
          'c.lampiran',
          'c.statusapprovalatasan',
          'c.tglapprovalatasan',
          'c.userapprovalatasan',
          'c.statusapprovalhrd',
          'c.tglapprovalhrd',
          'c.userapprovalhrd',
          'c.info',
          'c.modifiedby',
          trx.raw("FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        ])
        .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
        .leftJoin('parameter as p', 'c.statuscuti', 'p.id')
        .leftJoin('parameter as b', 'c.statuscutibatal', 'b.id')
        .leftJoin('parameter as cat', 'c.kategoricuti_id', 'cat.id')
        .leftJoin('parameter as sh', 'c.statusnonhitung', 'sh.id')
        .leftJoin('cutidetail as cd', 'c.id', 'cd.cuti_id')
        .leftJoin(`${datatempJatahCutiHasil2} as tc`, 'c.id', 'tc.cuti_id')
        .orderBy(sortBy ? `c.${sortBy}` : 'c.id', sortDirection || 'desc');

      if (search) {
        query.where((builder) => {
          builder
            .orWhere('c.tglcuti', 'like', `%${search}%`)
            .orWhere('k.namakaryawan', 'like', `%${search}%`)
            .orWhere('k.namaalias', 'like', `%${search}%`)
            .orWhere('c.ket', 'like', `%${search}%`)

            .orWhere('p.memo', 'like', `%${search}%`)

            .orWhere('c.alasanpenolakan', 'like', `%${search}%`);
        });
      }

      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
          if (value) {
            if (key === 'tglpengajuan') {
              query.andWhereRaw('c.tglpengajuan LIKE ?', [`%${value}%`]); // Sort by the actual date
            } else if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(c.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else if (key === 'year') {
              // Filter untuk tglpengajuan dengan format 'dd-MM-yyyy'
              query.andWhereRaw('YEAR(cd.tglcuti) = ?', [value]);
            } else {
              query.andWhere(`c.${key}`, 'like', `%${value}%`);
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

      if (parsedDetailCuti && parsedDetailCuti.length > 0) {
        await this.detailService.create(
          parsedDetailCuti,
          newItem.id,
          data.karyawan_id,
          trx,
          modifiedby,
        );
      }

      if (!dataKaryawan) {
        throw new Error('Data karyawan tidak ditemukan');
      }
      if (dataKaryawan.approval_id) {
        const dataApproval = await this.approvalDetailService.findById(
          dataKaryawan.approval_id,
          trx,
        );

        const modifiedDataApproval = dataApproval.map(
          ({ namakaryawan, id, created_at, updated_at, ...rest }) => ({
            ...rest,
            cuti_id: newItem.id,
            statusapproval: dataParameter[0].id,
            tglapproval: null,
            created_at: currentTime,
            updated_at: currentTime,
          }),
        );

        await this.cutiApproval.create(modifiedDataApproval, trx, modifiedby);
      }

      const karyawanId = await trx('cutiapproval')
        .select('karyawan_id')
        .where('cuti_id', newItem.id);
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
      const rawTglPengajuan = newItem.tglpengajuan;
      const formattedTglPengajuan = formatEmailDate(rawTglPengajuan);
      const allEmails = [
        ...recipientEmails, // Atasan and pengaju emails
        ...toemailArray, // TO emails
      ];

      const uniqueCcEmails = ccemailArray
        .map((email) => email.toUpperCase()) // Convert to uppercase
        .filter((email, index, self) => self.indexOf(email) === index); // Filter duplicates
      const uniqueEmailRecipients = [
        ...new Set([
          ...allEmails.map((email) => email.toUpperCase()), // Convert to uppercase and remove duplicates
        ]),
      ];

      const payload = {
        email: uniqueEmailRecipients,
        ccemail: uniqueCcEmails,
        name: dataKaryawan.namakaryawan,
        jabatan: dataKaryawan.jabatan_nama,
        cabang: dataKaryawan.cabang_nama,
        alasanPengajuan: newItem.alasancuti,
        jumlahCuti: newItem.jumlahcuti,
        namakaryawan: dataKaryawan.namakaryawan,
        status: 'DIAJUKAN',
        statussubject: '(DIAJUKAN)',
        tglCuti: newItem.tglcuti,
        tglPengajuan: formattedTglPengajuan,
      };

      await this.mailService.sendEmailCuti(payload);
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD CUTI',
          idtrans: newItem.id,
          nobuktitrans: newItem.id,
          aksi: 'ADD',
          datajson: JSON.stringify(newItem),
          modifiedby: newItem.modifiedby,
        },
        trx,
      );

      return { newItem, pageNumber, itemIndex };
    } catch (error) {
      console.error('Error creating cuti:', error);
      throw new InternalServerErrorException(
        `Error creating cuti: ${error.message}`,
      );
    }
  }

  async update(cutiHeader: any, id: number, trx: any, modifiedby: any) {
    const {
      detailCuti,
      sortBy,
      sortDirection,
      filters,
      search,
      page,
      year,
      limit,
      ...dataToCreate
    } = cutiHeader;
    Object.keys(dataToCreate).forEach((key) => {
      if (typeof dataToCreate[key] === 'string') {
        dataToCreate[key] = dataToCreate[key].toUpperCase();
      }
    });
    const existingData = await trx(this.tableName).where('id', id).first();
    if (!existingData) {
      throw new Error(`Data dengan ID ${id} tidak ditemukan.`);
    }

    const hasChanges = this.utilsService.hasChanges(dataToCreate, existingData);

    if (hasChanges) {
      dataToCreate.updated_at = this.utilsService.getTime();

      await trx(this.tableName).where('id', id).update(dataToCreate);
    }
    let parsedDetailCuti: any[] = [];
    if (Array.isArray(detailCuti)) {
      parsedDetailCuti = detailCuti.map((item) => JSON.parse(item));
    } else if (typeof detailCuti === 'string') {
      parsedDetailCuti = JSON.parse(detailCuti);
    }
    if (parsedDetailCuti && parsedDetailCuti.length > 0) {
      await this.detailService.create(
        parsedDetailCuti,
        id,
        dataToCreate.karyawan_id,
        trx,
        modifiedby,
      );
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
    rawFilters.karyawan_id = dataToCreate.karyawan_id;

    // 3. Gunakan filterObj di query nanti
    const filterObj = rawFilters;
    const query = trx(`${this.tableName} as c`)
      .select([
        'c.id as id',
        trx.raw("FORMAT(c.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"), // Untuk tampilan
        'c.karyawan_id',
        'k.namakaryawan as namakaryawan',
        'k.namaalias as namaalias',
        'c.tglcuti',
        'c.statuscuti',
        'p.memo as statuscuti_memo',
        'c.statuscutibatal',
        'b.memo as statuscutibatal_memo',
        'c.nohp',
        'c.alasanpenolakan',
        'c.alasancuti',
        'c.jumlahcuti',
        'c.kategoricuti_id',
        'cat.memo as kategoricuti_memo',
        'c.statusnonhitung',
        'sh.memo as statusnonhitung_memo',
        'c.lampiran',
        'c.statusapprovalatasan',
        'c.tglapprovalatasan',
        'c.userapprovalatasan',
        'c.statusapprovalhrd',
        'c.tglapprovalhrd',
        'c.userapprovalhrd',
        'c.info',
        'c.modifiedby',
        trx.raw("FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
        trx.raw("FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
      ])
      .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
      .leftJoin('parameter as p', 'c.statuscuti', 'p.id')
      .leftJoin('parameter as b', 'c.statuscutibatal', 'b.id')
      .leftJoin('parameter as cat', 'c.kategoricuti_id', 'cat.id')
      .leftJoin('parameter as sh', 'c.statusnonhitung', 'sh.id')
      .leftJoin('cutidetail as cd', 'c.id', 'cd.cuti_id')
      .orderBy(sortBy ? `c.${sortBy}` : 'c.id', sortDirection || 'desc');

    if (search) {
      query.where((builder) => {
        builder
          .orWhere('c.tglcuti', 'like', `%${search}%`)
          .orWhere('k.namakaryawan', 'like', `%${search}%`)
          .orWhere('k.namaalias', 'like', `%${search}%`)
          .orWhere('c.ket', 'like', `%${search}%`)

          .orWhere('p.memo', 'like', `%${search}%`)

          .orWhere('c.alasanpenolakan', 'like', `%${search}%`);
      });
    }

    if (filterObj) {
      for (const [key, value] of Object.entries(filterObj)) {
        if (value) {
          if (key === 'tglpengajuan') {
            query.andWhereRaw('c.tglpengajuan LIKE ?', [`%${value}%`]); // Sort by the actual date
          } else if (key === 'created_at' || key === 'updated_at') {
            query.andWhereRaw("FORMAT(c.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              key,
              `%${value}%`,
            ]);
          } else if (key === 'memo') {
            query.andWhere(`p.${key}`, '=', value);
          } else if (key === 'year') {
            // Filter untuk tglpengajuan dengan format 'dd-MM-yyyy'
            query.andWhereRaw('YEAR(cd.tglcuti) = ?', [value]);
          } else {
            query.andWhere(`c.${key}`, 'like', `%${value}%`);
          }
        }
      }
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
        postingdari: 'ADD CUTI',
        idtrans: existingData.id,
        nobuktitrans: existingData.id,
        aksi: 'ADD',
        datajson: JSON.stringify(existingData),
        modifiedby: modifiedby,
      },
      trx,
    );

    return { existingData, pageNumber, itemIndex };
  }

  // async checkApproval(data:any, trx: any) {
  //   const existing = await dbMssql('cutiapproval')
  //     .select('statusapproval')
  //     .where('cuti_id', data.cuti_id)
  //     .andWhere('karyawan_id',data.karyawan_id)
  //     .first();
  //   if (!existing) {
  // }
  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;
      page = page ?? 1;
      limit = limit ?? 0;
      const offset = (page - 1) * limit;

      const datatempJatahCutiHasil2 = await this.karyawanService.rekapCuti(
        String(filters?.karyawan_id),
        0,
        dbMssql,
      );
      // console.log(
      //   'datatempJatahCutiHasil2',
      //   await dbMssql(datatempJatahCutiHasil2),
      // );

      const query = dbMssql(`${this.tableName} as c`)
        .select([
          'c.id as id',
          dbMssql.raw("FORMAT(c.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"), // Untuk tampilan
          'c.karyawan_id',
          'k.namakaryawan as namakaryawan',
          'k.namaalias as namaalias',
          'c.tglcuti',
          'c.statuscuti',
          'c.statuscutibatal',
          'b.memo as statuscutibatal_memo',
          'c.nohp',
          'c.alasanpenolakan',
          'c.alasancuti',
          'c.jumlahcuti',
          'c.kategoricuti_id',
          'cat.memo as kategoricuti_memo',
          'c.statusnonhitung',
          dbMssql.raw(
            "(CASE WHEN ISNULL(c.statusnonhitung, 0) IN (147,148) THEN sh.text ELSE '' END) as statusnonhitung_nama",
          ),
          'c.lampiran',
          'c.statusapprovalatasan',
          'c.tglapprovalatasan',
          'c.userapprovalatasan',
          'c.statusapprovalhrd',
          'p.text as statuscuti_text',
          'p.memo as statuscuti_memo',
          'c.tglapprovalhrd',
          'c.userapprovalhrd',
          'c.info',
          'c.modifiedby',
          dbMssql.raw(
            "FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          dbMssql.raw(`
            ISNULL(tc.jatahcuti, 0) AS jatahcuti
          `),
          dbMssql.raw(`
            ISNULL(tc.sisacuti, 0) AS sisacuti
          `),
          dbMssql.raw(`
            ISNULL(tc.prediksicuti, 0) AS prediksicuti
          `),
          dbMssql.raw(`
              (SELECT cd.id, cd.tglcuti, cd.periodecutidari, cd.periodecutisampai, cd.info, cd.modifiedby, 
                FORMAT(cd.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at, FORMAT(cd.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at
              FROM cutidetail as cd 
              WHERE cd.cuti_id = c.id
              FOR JSON PATH) as detail
            `),
        ])
        .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
        .leftJoin('parameter as p', 'c.statuscuti', 'p.id')
        .leftJoin('parameter as b', 'c.statuscutibatal', 'b.id')
        .leftJoin('parameter as cat', 'c.kategoricuti_id', 'cat.id')
        .leftJoin(`${datatempJatahCutiHasil2} as tc`, 'c.id', 'tc.cuti_id')
        // .join('cutidetail as cd', 'c.id', 'cd.cuti_id')
        .leftJoin('parameter as sh', 'c.statusnonhitung', 'sh.id');

      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      if (search) {
        const sanitizedValue = String(search).replace(/\[/g, '[[]');
        query.where((builder) => {
          builder
            .orWhere('c.tglcuti', 'like', `%${sanitizedValue}%`)
            .orWhere('c.alasancuti', 'like', `%${sanitizedValue}%`)
            .orWhere('k.namakaryawan', 'like', `%${sanitizedValue}%`)
            .orWhere('k.namaalias', 'like', `%${sanitizedValue}%`);
        });
      }
      if (filters) {
        // Jika kedua filter periodedari dan periodesampai terisi,
        // pakai rentang langsung di c.tglpengajuan
        if (filters.periodedari && filters.periodesampai) {
          // Mengonversi format dd-MM-yyyy ke yyyy-MM-dd
          const periodedariFormatted = convertToDateFormat(filters.periodedari);
          const periodesampaiFormatted = convertToDateFormat(
            filters.periodesampai,
          );

          // Menggunakan tanggal yang sudah terkonversi dalam query
          query.andWhereRaw('c.tglpengajuan BETWEEN ? AND ?', [
            periodedariFormatted,
            periodesampaiFormatted,
          ]);
        }
        // Lanjutkan loop untuk filter lain (skip periodedari & periodesampai)
        for (const [key, value] of Object.entries(filters)) {
          if (!value) continue;
          if (key === 'periodedari' || key === 'periodesampai') continue;

          const sanitizedValue = String(value).replace(/\[/g, '[[]');
          // …tuliskan kondisi filter lain di sini…
          if (key === 'namakaryawan') {
            query.andWhere('k.namakaryawan', 'like', `%${sanitizedValue}%`);
          } else if (key === 'namaalias') {
            query.andWhere('k.namaalias', 'like', `%${sanitizedValue}%`);
          } else if (key === 'tglpengajuan') {
            query.andWhereRaw("FORMAT(c.tglpengajuan, 'dd-MM-yyyy') LIKE ?", [
              `%${sanitizedValue}%`,
            ]);
          } else if (key === 'year') {
            query.andWhereRaw('YEAR(c.tglpengajuan) = ?', [sanitizedValue]);
          } else if (key === 'karyawan_id') {
            query.andWhere('k.id', '=', `${sanitizedValue}`);
          } else {
            query.andWhere(`c.${key}`, 'like', `%${sanitizedValue}%`);
          }
        }
      }

      if (sort?.sortBy && sort?.sortDirection) {
        // Sorting based on the actual column (not the formatted string)
        if (sort.sortBy === 'tglpengajuan') {
          query.orderBy('c.tglpengajuan', sort.sortDirection);
        } else {
          query.orderBy(sort.sortBy, sort.sortDirection);
        }
      }

      const result = await dbMssql(this.tableName).count('id as total').first();
      const total = result?.total ? Number(result.total) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

      const data = await query;

      const parsedData = data.map((item: any) => {
        item.detail = item.detail ? JSON.parse(item.detail) : [];
        return item;
      });

      return {
        data: parsedData,
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
  async getOverviewCuti(karyawan_id: number) {
    try {
      // Ambil tglcuti terakhir dari cutidetail berdasarkan karyawan_id
      const lastCuti = await dbMssql('cuti')
        .select('id')
        .where('karyawan_id', karyawan_id)
        .orderBy('created_at', 'desc') // Urutkan berdasarkan tglcuti terakhir
        .first();

      const lastCutiDetail = await dbMssql('cutidetail')
        .select('tglcuti')
        .where('cuti_id', lastCuti.id)
        .orderBy('tglcuti', 'desc') // Urutkan berdasarkan tglcuti terakhir
        .first();
      if (!lastCutiDetail) {
        throw new Error('Tidak ada data cuti untuk karyawan ini');
      }

      // Ambil tglapproval dari cutiapproval berdasarkan cuti_id yang sesuai dengan tglcuti terakhir
      const tglApproval = await dbMssql('cutiapproval')
        .select('tglapproval')
        .where('cuti_id', lastCuti.id)
        .orderBy('jenjangapproval', 'desc') // Ambil yang terbaru
        .first();
      if (!tglApproval) {
        throw new Error('Tidak ada data approval untuk cuti ini');
      }
      // Format tanggal tglcuti dan tglapproval ke format 'DD-MM-YYYY'
      const lastCutiFormatted = new Date(lastCutiDetail.tglcuti);
      const day = String(lastCutiFormatted.getDate()).padStart(2, '0');
      const month = String(lastCutiFormatted.getMonth() + 1).padStart(2, '0'); // getMonth() is zero-indexed
      const year = lastCutiFormatted.getFullYear();

      const formattedDate = `${day}-${month}-${year}`; // Format menjadi DD-MM-YYYY

      let tglApprovalFormatted = '';
      if (tglApproval.tglapproval !== null) {
        const lastCutiFormatted = new Date(tglApproval.tglapproval);
        const day = String(lastCutiFormatted.getDate()).padStart(2, '0');
        const month = String(lastCutiFormatted.getMonth() + 1).padStart(2, '0'); // getMonth() is zero-indexed
        const year = lastCutiFormatted.getFullYear();
        tglApprovalFormatted = `${day}-${month}-${year}`; // Format menjadi DD-MM-YYYY
      }

      return {
        tglcuti_terakhir: formattedDate,
        tglapproval: tglApprovalFormatted,
      };
    } catch (error) {
      throw new Error(`Error fetching overview cuti: ${error.message}`);
    }
  }
  async findCutiApproval(
    { search, filters, pagination, sort }: FindAllParams,
    isproses: any,
    trx: any,
  ) {
    try {
      const { karyawan_id } = filters ?? {}; // Mengambil karyawan_id dari filters
      if (!karyawan_id) {
        throw new Error('karyawan_id is required');
      }
      const tempTableName = `cuti_approval_cache_${karyawan_id}`;

      if (isproses == 'false') {
        await trx.schema.dropTableIfExists(tempTableName);
        await trx.schema.createTable(tempTableName, (table) => {
          table.integer('id'); // Auto-increment primary key
          table.integer('karyawan_id').notNullable();
          table.text('namakaryawan');
          table.string('fotokaryawan');
          table.string('namaalias');
          table.text('tglcuti');
          table.datetime('tglpengajuan');
          table.string('statuscuti');
          table.string('statuscuti_memo');
          table.string('statuscuti_text');
          table.integer('statuscutibatal');
          table.string('statuscutibatal_memo');
          table.string('nohp');
          table.text('alasanpenolakan');
          table.text('alasancuti');
          table.integer('jumlahcuti');
          table.integer('kategoricuti_id');
          table.string('kategoricuti_memo');
          table.string('statusnonhitung');
          table.string('statusnonhitung_nama');
          table.text('lampiran');
          table.string('statusapprovalatasan');
          table.string('tglapprovalatasan');
          table.string('userapprovalatasan');
          table.string('statusapprovalhrd');
          table.string('tglapprovalhrd');
          table.string('userapprovalhrd');
          table.string('statusapproval_text');
          table.string('statusapproval_memo');
          table.integer('statusapproval');
          table.text('info');
          table.string('modifiedby');
          table.integer('jenjangapproval');
          table.datetime('created_at');
          table.datetime('updated_at');
          table.integer('jatahcuti');
          table.integer('sisacuti');
          table.integer('prediksicuti');
        });

        const tempApprovalCuti =
          '##tempApprovalCuti' + Math.random().toString(36).substring(2, 8);
        await trx.schema.createTable(tempApprovalCuti, (t) => {
          t.integer('id');
          t.integer('cuti_id');
          t.integer('karyawan_id');
          t.integer('jenjangapproval');
          t.integer('statusapproval');
          t.string('statusapproval_text');
          t.string('statusapproval_memo');
        });
        await trx(tempApprovalCuti).insert(
          trx
            .select(
              'ca.id',
              'ca.cuti_id',
              'ca.karyawan_id',
              'ca.jenjangapproval',
              'ca.statusapproval',
              'p.text as statusapproval_text',
              'p.memo as statusapproval_memo',
            )
            .from('cutiapproval as ca')
            .leftJoin('parameter as p', 'p.id', 'ca.statusapproval')
            .where('ca.karyawan_id', '=', karyawan_id),
        );

        // Langkah 1: Ambil cuti_id dari tabel cutiApproval berdasarkan karyawan_id
        const cutiApprovalIds = await trx('cutiApproval')
          .select('cuti_id')
          .where('karyawan_id', '=', karyawan_id);

        // Jika tidak ada cutiApproval yang ditemukan, kembalikan data kosong
        if (cutiApprovalIds.length === 0) {
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

        const karyawanIdCutiPromises = cutiApprovalIds.map(async (cuti) => {
          const karyawanData = await trx('cuti')
            .select('karyawan_id')
            .where('id', cuti.cuti_id)
            .first();
          return karyawanData; // Mengembalikan data karyawan_id
        });

        // Tunggu hingga semua query selesai
        const karyawanIdCuti = await Promise.all(karyawanIdCutiPromises);
        const filteredKaryawanIdCuti = [
          ...new Map(
            karyawanIdCuti
              .filter((item) => item !== undefined)
              .map((item) => [item.karyawan_id, item]),
          ).values(),
        ];
        const karyawanIds = filteredKaryawanIdCuti.map(
          (item) => item.karyawan_id,
        );
        // Panggil rekapCuti dengan karyawan_id yang sudah difilter
        const datatempJatahCutiHasil2 =
          await this.karyawanService.rekapCutiAllKaryawan(
            karyawanIds, // Gabungkan karyawan_id menjadi string dengan koma sebagai pemisah
            0,
            0,
            0,
            trx,
          );
        // Langkah 2: Ambil data cuti berdasarkan cuti_id yang ada di cutiApproval
        const data = await trx('cuti as c')
          .select([
            'c.id as id',
            'c.tglpengajuan',
            'c.karyawan_id',
            'k.namakaryawan as namakaryawan',
            'k.foto as fotokaryawan',
            'k.namaalias as namaalias',
            'c.tglcuti',
            'c.statuscuti',
            'p.memo as statuscuti_memo',
            'p.text as statuscuti_text',
            'c.statuscutibatal',
            'b.memo as statuscutibatal_memo',
            'c.nohp',
            'c.alasanpenolakan',
            'c.alasancuti',
            'c.jumlahcuti',
            'c.kategoricuti_id',
            'cat.memo as kategoricuti_memo',
            'c.statusnonhitung',
            trx.raw(
              "(CASE WHEN ISNULL(c.statusnonhitung, 0) IN (147,148) THEN sh.text ELSE '' END) as statusnonhitung_nama",
            ),
            'c.lampiran',
            'c.statusapprovalatasan',
            'c.tglapprovalatasan',
            'c.userapprovalatasan',
            'c.statusapprovalhrd',
            'c.tglapprovalhrd',
            'c.userapprovalhrd',
            'ca.statusapproval_text as statusapproval_text',
            'ca.statusapproval_memo as statusapproval_memo',
            'ca.statusapproval as statusapproval',
            'c.info',
            'c.modifiedby',
            'ca.jenjangapproval',
            'c.created_at',
            'c.updated_at',
            trx.raw(`
              ISNULL(tc.jatahcuti, 0) AS jatahcuti
            `),
            trx.raw(`
              ISNULL(tc.sisacuti, 0) AS sisacuti
            `),
            trx.raw(`
              ISNULL(tc.prediksicuti, 0) AS prediksicuti
            `),
          ])
          .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
          .leftJoin('parameter as p', 'c.statuscuti', 'p.id')
          .leftJoin('parameter as b', 'c.statuscutibatal', 'b.id')
          .leftJoin('parameter as cat', 'c.kategoricuti_id', 'cat.id')
          .leftJoin('parameter as sh', 'c.statusnonhitung', 'sh.id')
          .leftJoin(`${tempApprovalCuti} as ca`, 'c.id', 'ca.cuti_id')
          .leftJoin(`${datatempJatahCutiHasil2} as tc`, 'c.id', 'tc.cuti_id')
          .whereIn(
            'c.id',
            cutiApprovalIds.map((approval: any) => approval.cuti_id),
          ); // Filter berdasarkan cuti_id dari cutiApproval

        for (const item of data) {
          await trx(tempTableName).insert(item);
        }
      }
      let { page, limit } = pagination;
      page = page ?? 1;
      limit = limit ?? 0;
      const offset = (page - 1) * limit;

      const query = trx(`${tempTableName} as a`).select(
        'a.id',
        'a.karyawan_id',
        'a.namakaryawan as namakaryawan',
        'a.namaalias as namaalias',
        'a.tglcuti',
        'a.fotokaryawan',
        'a.statuscuti',
        'a.statuscuti_memo',
        'a.statuscuti_text',
        'a.statuscutibatal',
        'a.statuscutibatal_memo',
        'a.nohp',
        'a.alasanpenolakan',
        'a.alasancuti',
        'a.jumlahcuti',
        'a.kategoricuti_id',
        'a.kategoricuti_memo',
        'a.statusnonhitung',
        trx.raw("FORMAT(a.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
        'a.lampiran',
        'a.statusapprovalatasan',
        'a.tglapprovalatasan',
        'a.userapprovalatasan',
        'a.statusapprovalhrd',
        'a.tglapprovalhrd',
        'a.userapprovalhrd',
        'a.info',
        'a.modifiedby',
        'a.jenjangapproval',
        trx.raw("FORMAT(a.created_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        trx.raw("FORMAT(a.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        'a.jatahcuti',
        'a.sisacuti',
        'a.prediksicuti',
        'a.statusapproval',
        'a.statusapproval_text',
        'a.statusapproval_memo',
        trx.raw('COUNT(*) OVER() AS __total_items'),
        trx.raw(`
          (SELECT cd.id, cd.tglcuti, cd.periodecutidari, cd.periodecutisampai, cd.info, cd.modifiedby, 
            FORMAT(cd.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at, FORMAT(cd.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at
          FROM cutidetail as cd 
          WHERE cd.cuti_id = a.id
          FOR JSON PATH) as detail
        `),
      );

      // Pagination
      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      // Search
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('a.tglcuti', 'like', `%${search}%`)
            .orWhere('a.alasancuti', 'like', `%${search}%`)
            .orWhere('a.namakaryawan', 'like', `%${search}%`)
            .orWhere('a.namaalias', 'like', `%${search}%`);
        });
      }

      // Filters lainnya
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (key !== 'karyawan_id' && key !== 'isproses' && value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(a.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'memo') {
              query.andWhere(`a.${key}`, '=', value);
            } else if (key === 'namakaryawan') {
              // Gunakan alias 'karyawan_nama' yang sudah didefinisikan dalam SELECT
              query.andWhere('a.namakaryawan', 'like', `%${value}%`);
            } else if (key === 'namaalias') {
              // Gunakan alias 'namaalias' yang sudah didefinisikan dalam SELECT
              query.andWhere('a.namaalias', 'like', `%${value}%`);
            } else if (key === 'tglpengajuan') {
              // Filter untuk tglpengajuan dengan format 'dd-MM-yyyy'
              query.andWhereRaw("FORMAT(a.tglpengajuan, 'dd-MM-yyyy') LIKE ?", [
                `%${value}%`,
              ]);
            } else {
              query.andWhere(`a.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      // Sorting
      if (sort?.sortBy && sort?.sortDirection) {
        if (sort.sortBy === 'tglpengajuan') {
          query.orderBy('a.tglpengajuan', sort.sortDirection);
        } else {
          query.orderBy(sort.sortBy, sort.sortDirection);
        }
      }
      const data = await query;

      const total = data.length ? Number(data[0].__total_items) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
      const itemsPerPage = limit > 0 ? limit : total;
      const parsedData = data.map((item: any) => {
        item.detail = item.detail ? JSON.parse(item.detail) : [];
        return item;
      });
      return {
        data: parsedData,
        total: total, // Total item dihitung dari window function
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalItems: total,
          itemsPerPage,
        },
      };
    } catch (error) {
      console.error('Error fetching cuti approval data:', error);
      throw new Error(error);
    }
  }

  async rekapCutiData(
    idcabang: number,
    tanggalDari: string,
    tanggalSampai: string,
    trx: any,
  ): Promise<any[]> {
    try {
      // Validasi format tanggal, pastikan tanggal dalam format ISO 8601 (YYYY-MM-DD)
      const startDate = `${tanggalDari}T00:00:00.000Z`; // Waktu mulai dari tanggalDari (pukul 00:00)
      const endDate = `${tanggalSampai}T23:59:59.999Z`; // Waktu selesai di tanggalSampai (pukul 23:59)
      const Tempcutidetail =
        '##Tempcutidetail' + Math.random().toString(36).substring(2, 8);
      const Tempdatacuti =
        '##Tempdatacuti' + Math.random().toString(36).substring(2, 8);
      const Tempawalapproval =
        '##Tempawalapproval' + Math.random().toString(36).substring(2, 8);
      const Tempakhirapproval =
        '##Tempakhirapproval' + Math.random().toString(36).substring(2, 8);
      await trx.schema.createTable(Tempcutidetail, (t) => {
        t.integer('cuti_id');
        t.integer('karyawan_id');
        t.datetime('tglcuti');
        t.integer('urut');
      });
      await trx.schema.createTable(Tempdatacuti, (t) => {
        t.integer('cuti_id');
      });
      await trx.schema.createTable(Tempawalapproval, (t) => {
        t.integer('cuti_id');
        t.integer('approvalawal');
        t.datetime('tglapproval');
      });
      await trx.schema.createTable(Tempakhirapproval, (t) => {
        t.integer('cuti_id');
        t.integer('approvalakhir');
        t.datetime('tglapproval');
      });
      await trx(Tempcutidetail).insert(
        trx
          .select('A.id', 'C.id', 'B.tglcuti')
          .select(
            trx.raw(
              `ROW_NUMBER() OVER (PARTITION BY C.id, A.id ORDER BY C.id, A.id, B.tglcuti ASC) AS urut`,
            ),
          )
          .from('cuti AS A')
          .innerJoin('cutidetail AS B', 'A.id', 'B.cuti_id')
          .innerJoin('karyawan AS C', 'A.karyawan_id', 'C.id')
          .where('B.tglcuti', '>=', trx.raw('?', startDate))
          .andWhere('B.tglcuti', '<=', trx.raw('?', endDate))
          .andWhere('C.cabang_id', '=', idcabang)
          .orderBy('C.id')
          .orderBy('B.tglcuti')
          .orderBy('A.id'),
      );
      await trx(Tempdatacuti).insert(
        trx.select('cuti_id').from(Tempcutidetail).groupBy('cuti_id'),
      );
      await trx(Tempawalapproval).insert(
        trx
          .select('A.cuti_id')
          .select(trx.raw('MIN(A.jenjangapproval) AS approvalawal')) // Alias MIN result as approvalawal
          .select(trx.raw('NULL AS tglapproval')) // Insert NULL for tglapproval
          .from('cutiapproval AS A')
          .innerJoin(`${Tempdatacuti} AS B`, 'A.cuti_id', 'B.cuti_id')
          .groupBy('A.cuti_id'),
      );

      await trx(Tempawalapproval)
        .innerJoin(`cutiapproval as C`, function () {
          // tanpa alias untuk main table di UPDATE
          this.on(`${Tempawalapproval}.cuti_id`, '=', 'C.cuti_id').andOn(
            `${Tempawalapproval}.approvalawal`,
            '=',
            'C.jenjangapproval',
          );
        })
        .update({
          // trx.ref bikin [C].[tglapproval]
          tglapproval: trx.ref('C.tglapproval'),
        });

      await trx(Tempakhirapproval).insert(
        trx
          .select('A.cuti_id')
          .select(trx.raw('MAX(A.jenjangapproval)'))
          .select(trx.raw('NULL AS tglapproval'))
          .from('cutiapproval AS A')
          .innerJoin(`${Tempdatacuti} AS B`, 'A.cuti_id', 'B.cuti_id')
          .where('a.statusapproval', 151)
          .groupBy('A.cuti_id'),
      );

      await trx(Tempakhirapproval)
        .innerJoin(`cutiapproval as C`, function () {
          // tanpa alias untuk main table di UPDATE
          this.on(`${Tempakhirapproval}.cuti_id`, '=', 'C.cuti_id').andOn(
            `${Tempakhirapproval}.approvalakhir`,
            '=',
            'C.jenjangapproval',
          );
        })
        .where('c.statusapproval', '=', 151)
        .update({
          // trx.ref bikin [C].[tglapproval]
          tglapproval: trx.ref('C.tglapproval'),
        });

      // 1. Ambil data awal sesuai query dan hitung urutan (furut)
      const result = await trx
        .select(
          // pakai backtick untuk multiline raw SQL
          trx.raw(
            `CASE WHEN a.urut = 1 THEN c.namakaryawan ELSE '' END AS Karyawan`,
          ),
          trx.raw(
            `CASE WHEN a.urut = 1 THEN b.tglpengajuan ELSE NULL END AS tglpengajuan`,
          ),
          trx.raw(
            `CASE WHEN a.urut = 1 THEN b.alasancuti ELSE '' END AS alasancuti`,
          ),
          'a.tglcuti',
          trx.raw(
            `CASE WHEN a.urut = 1 THEN d.tglapproval ELSE NULL END AS approvalatasan`,
          ),
          trx.raw(
            `CASE WHEN a.urut = 1 THEN e.tglapproval ELSE NULL END AS approvalhr`,
          ),
        )
        .from(`${Tempcutidetail} as a`)
        // pindahkan hint isolation ke sini
        .innerJoin(trx.raw(`cuti as b WITH (READUNCOMMITTED)`), function () {
          this.on('a.cuti_id', '=', 'b.id').andOn('b.statuscuti', '=', 151);
        })
        .innerJoin('karyawan as c', 'a.karyawan_id', 'c.id')
        .leftJoin(`${Tempawalapproval} as d`, 'a.cuti_id', 'd.cuti_id')
        .leftJoin(`${Tempakhirapproval} as e`, 'a.cuti_id', 'e.cuti_id');

      return result;
    } catch (error) {
      console.error('Error in rekapCutiData:', error);
      throw new InternalServerErrorException(
        `Error rekap cuti data: ${error.message}`,
      );
    }
  }

  async rekapSaldoCutiData(
    idcabang: number,
    tahun: string,
    trx: any,
  ): Promise<any[]> {
    try {
      const Tempdata1 =
        '##Tempdata1' + Math.random().toString(36).substring(2, 8);
      await trx.schema.createTable(Tempdata1, (t) => {
        t.integer('karyawan_id');
        t.integer('jumlah');
      });
      await trx(Tempdata1).insert(
        trx
          .select('A.karyawan_id')
          .count('A.karyawan_id as jumlah')
          .from('cuti AS A')
          .innerJoin(`cutiapproval AS B`, function () {
            this.on('A.id', '=', 'B.cuti_id').andOn(
              'b.jenjangapproval',
              '=',
              1,
            );
          })
          .innerJoin('cutidetail AS C', 'A.id', 'C.cuti_id')
          .whereRaw('YEAR(C.tglcuti) = ?', [tahun]) // Use whereRaw for year comparison
          .andWhereRaw('ISNULL(A.statuscuti,0) = 151')
          .andWhere('A.statusnonhitung', '147')
          .groupBy('A.karyawan_id'),
      );
      await trx(Tempdata1).insert(
        trx
          .select('A.id as karyawan_id', trx.raw('0 as jumlah'))
          .from('karyawan AS A')
          .leftOuterJoin(`${Tempdata1} AS B`, 'A.id', 'B.karyawan_id')
          .andWhereRaw('ISNULL(B.karyawan_id, 0) = 0') // Use ISNULL for conditional check
          .whereRaw('a.cabang_id = ?', [idcabang]) // Use whereRaw for year comparison
          .andWhereRaw("YEAR(ISNULL(a.tglresign, '1900/1/1'))=1900"),
      );
      const Tempdata1nonhitung =
        '##Tempdata1nonhitung' + Math.random().toString(36).substring(2, 8);
      await trx.schema.createTable(Tempdata1nonhitung, (t) => {
        t.integer('karyawan_id');
        t.integer('jumlah');
      });
      await trx(Tempdata1nonhitung).insert(
        trx
          .select('A.karyawan_id')
          .count('A.karyawan_id as jumlah')
          .from('cuti AS A')
          .innerJoin('cutiapproval AS B', 'A.id', 'B.cuti_id')
          .innerJoin('cutidetail AS C', 'A.id', 'C.cuti_id')
          .whereRaw('YEAR(C.tglcuti) = ?', [tahun]) // Use whereRaw for year comparison
          .andWhere('A.statusnonhitung', '148')
          .andWhereRaw('ISNULL(A.statuscuti,0) = 151')
          .groupBy('A.karyawan_id'),
      );

      const Tempjatahcuti =
        '##Tempjatahcuti' + Math.random().toString(36).substring(2, 8);
      await trx.schema.createTable(Tempjatahcuti, (t) => {
        t.integer('karyawan_id');
        t.integer('jatahcuti');
        t.integer('terpakai');
      });

      const karyawanIds = await trx
        .select('b.id')
        .from(`${Tempdata1} as a`)
        .innerJoin('karyawan as b', 'a.karyawan_id', 'b.id')
        .leftOuterJoin('jabatan as c', 'b.jabatan_id', 'c.id')
        .whereNull('b.tglresign')
        .where('b.cabang_id', idcabang);

      const karyawanIdsArray = karyawanIds.map((karyawan) =>
        karyawan.id.toString(),
      );

      const dataRekapCuti = await this.karyawanService.rekapCutiAllKaryawan(
        karyawanIdsArray,
        tahun, // Use the extracted year from ptgl
        1,
        0,
        trx,
      );
      await trx(Tempjatahcuti).insert(
        dataRekapCuti.map((item) => ({
          karyawan_id: item.karyawan_id,
          jatahcuti: item.jatahcuti,
          terpakai: item.terpakai,
        })),
      );

      const minusCuti = await trx(`cabang as a`)
        .select('a.minuscuti')
        .where('a.id', idcabang)
        .first();

      const result = await trx(`karyawan as b`)
        .select(
          'b.id',
          'b.namakaryawan',
          trx.raw("ISNULL(c.nama, '') AS jabatan"), // Proper alias for ISNULL
          'b.tglmasukkerja',
          trx.raw('ISNULL(d.jatahcuti, 0) AS jatahcuti'), // Proper alias for ISNULL
          trx.raw(
            `(CASE WHEN ${minusCuti.minuscuti}=164 THEN ISNULL(D.terpakai,0) else 0 end) AS terpakai`,
          ), // Proper alias for ISNULL
          trx.raw('ISNULL(a.jumlah,0) as jumlah'),
          trx.raw('ISNULL(e.jumlah, 0) AS jumlahnonhitung'), // Proper alias for ISNULL
        )
        .leftOuterJoin(`${Tempdata1} as a`, 'a.karyawan_id', 'b.id')
        .leftOuterJoin('jabatan as c', 'b.jabatan_id', 'c.id')
        .leftOuterJoin(`${Tempjatahcuti} as d`, 'b.id', 'd.karyawan_id')
        .leftOuterJoin(`${Tempdata1nonhitung} as e`, 'b.id', 'e.karyawan_id')
        .whereNull('b.tglresign')
        .where('b.cabang_id', idcabang)
        .andWhereRaw("YEAR(ISNULL(b.tglresign, '1900/1/1'))=1900")
        .orderBy('b.namakaryawan');

      // Return an empty array or appropriate data as a placeholder
      return result;
    } catch (error) {
      console.error('Error in rekapCutiData:', error);
      throw new InternalServerErrorException(
        `Error rekap cuti data: ${error.message}`,
      );
    }
  }
  async getDetailCuti(id: number) {
    try {
      const cuti = await dbMssql(this.tableName).where('id', id).first();

      if (!cuti) {
        throw new NotFoundException(`Cuti dengan ID ${id} tidak ditemukan`);
      }

      const cutiDetails = await dbMssql('cutidetail')
        .where('cuti_id', id)
        .select('*');

      return {
        cuti,
        detailCuti: cutiDetails,
      };
    } catch (error) {
      console.error('Error fetching cuti detail:', error);
      throw new InternalServerErrorException('Gagal mengambil detail cuti');
    }
  }
  async exportToExcel(data) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:G1');
    worksheet.mergeCells('A2:G2');
    worksheet.mergeCells('A3:G3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN CUTI KARYAWAN';
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
      'NO.',
      'NAMA KARYAWAN',
      'STATUS CUTI',
      'TANGGAL PENGAJUAN',
      'TANGGAL CUTI',
      'JUMLAH CUTI',
      'ALASAN CUTI',
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
      const currentRow = rowIndex + 6;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1;
      worksheet.getCell(currentRow, 2).value = row.namakaryawan;
      worksheet.getCell(currentRow, 3).value = row.statuscuti_text;
      worksheet.getCell(currentRow, 4).value = row.tglpengajuan;
      worksheet.getCell(currentRow, 5).value = row.tglcuti;
      worksheet.getCell(currentRow, 6).value = row.jumlahcuti;
      worksheet.getCell(currentRow, 7).value = row.alasancuti;

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

    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 40;
    worksheet.getColumn(3).width = 20;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 40;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 50;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_cuti_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  async exportToExcelRekap(data) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:G1');
    worksheet.mergeCells('A2:G2');
    worksheet.mergeCells('A3:G3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN CUTI KARYAWAN';
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
    const headers = [
      'NO.',
      'NAMA',
      'TGL PENGAJUAN',
      'ALASAN CUTI',
      'TGL CUTI',
      'TGL APPROVAL ATASAN',
      'TGL APPROVAL HR',
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

    // Loop to populate the data in the respective columns
    data.forEach((row, rowIndex) => {
      const currentRow = rowIndex + 6;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1;
      worksheet.getCell(currentRow, 2).value = row.Karyawan; // 'Karyawan' key
      worksheet.getCell(currentRow, 3).value = row.tglpengajuan; // 'tglpengajuan' key
      worksheet.getCell(currentRow, 4).value = row.alasancuti; // 'alasancuti' key
      worksheet.getCell(currentRow, 5).value = row.tglcuti; // 'tglcuti' key
      worksheet.getCell(currentRow, 6).value = row.approvalatasan; // 'approvalatasan' key
      worksheet.getCell(currentRow, 7).value = row.approvalhr; // 'approvalhr' key

      // Set the date format for TGL CUTI
      worksheet.getCell(currentRow, 3).numFmt = 'DD-MM-YYYY';
      worksheet.getCell(currentRow, 5).numFmt = 'DD-MM-YYYY';

      // Set the date-time format for TGL APPROVAL ATASAN and TGL APPROVAL HR
      worksheet.getCell(currentRow, 6).numFmt = 'DD-MM-YYYY HH:mm:ss';
      worksheet.getCell(currentRow, 7).numFmt = 'DD-MM-YYYY HH:mm:ss';

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
    worksheet.getColumn(5).width = 15; // Adjusted width for formatted date
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_cuti_karyawan_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }
  async exportRekapSaldoCuti(data, tahun) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:F1');
    worksheet.mergeCells('A2:F2');
    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN SALDO CUTI KARYAWAN';
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
    const headers = [
      'NO.',
      'NAMA KARYAWAN',
      'JABATAN',
      'TANGGAL MASUK KERJA',
      'JATAH CUTI',
      `TERPAKAI ${tahun - 1}`,
    ];

    // Merge 'JUMLAH CUTI' header (for 'HITUNG' and 'NON HITUNG')
    worksheet.mergeCells('G5:H5'); // Merge the 'JUMLAH CUTI' header cell
    worksheet.getCell('G5').value = 'JUMLAH CUTI'; // Set the merged header value
    worksheet.getCell('G5').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('G5').font = { bold: true, name: 'Tahoma', size: 10 };
    worksheet.getCell('G5').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' }, // Yellow background for JUMLAH CUTI
    };
    worksheet.getCell('G5').border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // Merge 'HITUNG' header
    worksheet.getCell('G6').value = 'HITUNG'; // Set the sub-header for HITUNG
    worksheet.getCell('G6').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('G6').font = { bold: true, name: 'Tahoma', size: 10 };
    worksheet.getCell('G6').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' }, // Yellow background for HITUNG
    };
    worksheet.getCell('G6').border = {
      left: { style: 'thin' },
      bottom: { style: 'thin' },
    };

    // Merge 'NON HITUNG' header
    worksheet.getCell('H6').value = 'NON HITUNG'; // Set the sub-header for NON HITUNG
    worksheet.getCell('H6').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('H6').font = { bold: true, name: 'Tahoma', size: 10 };
    worksheet.getCell('H6').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' }, // Yellow background for NON HITUNG
    };
    worksheet.getCell('H6').border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // Merge 'SISA CUTI' header (row 5 and 6)
    worksheet.mergeCells('I5:I6'); // Merge the 'SISA CUTI' header cell
    worksheet.getCell('I5').value = 'SISA CUTI'; // Set the merged header value
    worksheet.getCell('I5').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('I5').font = { bold: true, name: 'Tahoma', size: 10 };
    worksheet.getCell('I5').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' }, // Yellow background for SISA CUTI
    };
    worksheet.getCell('I5').border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // Set the rest of the header row
    headers.forEach((header, index) => {
      if (index !== 6) {
        const col = index + 1;
        // Merge cell dari (row 5, col) sampai (row 6, col)
        worksheet.mergeCells(5, col, 6, col);

        // Ambil master cell (row 5, col) untuk diisi value & styling
        const cell = worksheet.getCell(5, col);
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
      }
    });

    // Loop to populate the data in the respective columns
    data.forEach((row, rowIndex) => {
      const currentRow = rowIndex + 7;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1;
      worksheet.getCell(currentRow, 2).value = row.namakaryawan; // 'Karyawan' key
      worksheet.getCell(currentRow, 3).value = row.jabatan; // 'tglpengajuan' key
      worksheet.getCell(currentRow, 4).value = row.tglmasukkerja; // 'alasancuti' key
      worksheet.getCell(currentRow, 5).value = row.jatahcuti; // 'tglcuti' key
      worksheet.getCell(currentRow, 6).value = row.terpakai; // 'approvalatasan' key
      worksheet.getCell(currentRow, 7).value = row.jumlah; // 'approvalhr' key
      worksheet.getCell(currentRow, 8).value = row.jumlahnonhitung; // 'approvalhr' key

      // Calculate the remaining leave (SISA CUTI)
      const sisaCuti = row.jatahcuti - row.jumlah - row.terpakai;
      worksheet.getCell(currentRow, 9).value = sisaCuti; // 'SISA CUTI'

      // Set the date format for TGL CUTI
      worksheet.getCell(currentRow, 4).numFmt = 'DD-MM-YYYY';
      for (let col = 1; col <= 9; col++) {
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
    worksheet.getColumn(5).width = 15; // Adjusted width for formatted date
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 20; // Add width for the SISA CUTI column

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_saldo_cuti_karyawan_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  async findAllByIds(ids: { id: number }[], karyawan_id: string) {
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
      const query = dbMssql(`${this.tableName} as c`)
        .select([
          'c.id as id',
          dbMssql.raw("FORMAT(c.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
          'c.karyawan_id',
          'k.namakaryawan as namakaryawan',
          'k.namaalias as namaalias',
          'c.tglcuti',
          'c.statuscuti',
          'p.memo as statuscuti_memo',
          'c.statuscutibatal',
          'b.memo as statuscutibatal_memo',
          'c.nohp',
          'c.alasanpenolakan',
          'c.alasancuti',
          'c.jumlahcuti',
          'c.kategoricuti_id',
          'p.text as statuscuti_text',
          'cat.memo as kategoricuti_memo',
          'c.statusnonhitung',
          'sh.memo as statusnonhitung_memo',
          'c.lampiran',
          'c.statusapprovalatasan',
          'c.tglapprovalatasan',
          'c.userapprovalatasan',
          'c.statusapprovalhrd',
          'c.tglapprovalhrd',
          'c.userapprovalhrd',
          'c.info',
          'c.modifiedby',
          dbMssql.raw(
            "FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          dbMssql.raw(`
          (SELECT cd.id, cd.tglcuti, cd.periodecutidari, cd.periodecutisampai, cd.info, cd.modifiedby, 
            FORMAT(cd.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at, FORMAT(cd.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at
          FROM cutidetail as cd 
          WHERE cd.cuti_id = c.id
          FOR JSON PATH) as detail
        `),
        ])
        .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
        .leftJoin('parameter as p', 'c.statuscuti', 'p.id')
        .leftJoin('parameter as b', 'c.statuscutibatal', 'b.id')
        .leftJoin('parameter as cat', 'c.kategoricuti_id', 'cat.id')
        .leftJoin('parameter as sh', 'c.statusnonhitung', 'sh.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'c.id', 'temp.id')

        .orderBy('c.tglpengajuan', 'ASC');

      const data = await query;

      const dropTempTableQuery = `DROP TABLE ${tempData};`;
      await dbMssql.raw(dropTempTableQuery);

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }
  async cancel(cutiId: number, trx: any) {
    try {
      const dataParameter = await trx('parameter')
        .where('grp', 'STATUS APPROVAL')
        .andWhere('text', 'DIBATALKAN');
      const datacuti = await trx(this.tableName)
        .select('karyawan_id')
        .where('id', cutiId)
        .first();
      const detailCuti = await trx('cutidetail')
        .select('tglcuti')
        .where('cuti_id', cutiId);

      // Loop melalui setiap tglcuti untuk menghapus data kartucuti yang sesuai
      for (const detail of detailCuti) {
        await trx('kartucuti')
          .where('karyawan_id', datacuti.karyawan_id)
          .andWhere('tgltransaksi', detail.tglcuti) // Hapus berdasarkan tgltransaksi yang sama dengan tglcuti
          .delete();
      }
      const dataApproval = await trx('karyawan')
        .select('approval_id')
        .where('id', datacuti.karyawan_id);
      const updated = await trx(this.tableName).where('id', cutiId).update({
        statuscutibatal: dataParameter[0].id,
        statuscuti: dataParameter[0].id,
        updated_at: trx.fn.now(),
      });
      await this.cutiApproval.updateApprovalStatus(cutiId, trx);

      return updated;
    } catch (error) {
      console.error('Error updating statuscuti:', error);
      throw error;
    }
  }
}
