import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateKaryawanDto } from './dto/create-karyawan.dto';
import { UpdateKaryawanDto } from './dto/update-karyawan.dto';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { dbMssql } from 'src/common/utils/db';
import { RedisService } from 'src/common/redis/redis.service';
import {
  convertToDateFormat,
  formatDateToSQL,
  UtilsService,
} from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import sharp from 'sharp';
import { Workbook } from 'exceljs';
import path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/common/mail/mail.service';

@Injectable()
export class KaryawanService {
  private tableName: string = 'karyawan';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
    private readonly mailService: MailService,
  ) {}
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
  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;

      page = page ?? 1;
      limit = limit ?? 10;
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
          'k.absen_id',
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
          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',
          'a.nama as approval_nama',
          'shift.nama as shift_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          dbMssql.raw(
            "COALESCE(atasan.namakaryawan, 'Tidak ada') as atasan_nama",
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
        .leftJoin('shift as shift', 'k.shift_id', 'shift.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id')
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id')
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id')
        .whereNull('k.tglresign');

      query.limit(limit).offset(offset);

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
            .orWhere('shift.nama', 'like', `%${search}%`)
            .orWhere('j.nama', 'like', `%${search}%`)
            .orWhereRaw("FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              `%${search}%`,
            ])
            .orWhereRaw("FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              `%${search}%`,
            ])
            .orWhere('de.nama', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(k.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (
              key === 'tgllahir' ||
              key === 'tglmasukkerja' ||
              key === 'tglmutasi' ||
              key === 'tglresign'
            ) {
              query.andWhereRaw("FORMAT(k.??, 'dd-MM-yyyy') LIKE ?", [
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

      if (sort?.sortBy && sort?.sortDirection) {
        // Sorting based on the actual column (not the formatted string)
        if (sort.sortBy === 'tglmasukkerja') {
          query.orderBy('k.tglmasukkerja', sort.sortDirection);
        } else if (sort.sortBy === 'tgllahir') {
          query.orderBy('k.tgllahir', sort.sortDirection);
        } else if (sort.sortBy === 'tglmutasi') {
          query.orderBy('k.tglmutasi', sort.sortDirection);
        } else if (sort.sortBy === 'tglresign') {
          query.orderBy('k.tglresign', sort.sortDirection);
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
      console.error('Error fetching data:', error);
      throw new Error(error);
    }
  }

  async rekapCuti(id: string, isoverview: any, trx: any) {
    const tempCuti =
      '##temp_cuti_' + Math.random().toString(36).substring(2, 8);
    const tempMinusCutiTable =
      '##temp_minuscuti_' + Math.random().toString(36).substring(2, 8);
    const tempMinusCutiTable2 =
      '##temp_minuscuti2_' + Math.random().toString(36).substring(2, 8);
    const tempSaldoCuti =
      '##Tempsaldocuti' + Math.random().toString(36).substring(2, 8);
    const tempHangusCuti2 =
      '##temphanguscuti2' + Math.random().toString(36).substring(2, 8);
    const tempHangusCuti =
      '##temphanguscuti' + Math.random().toString(36).substring(2, 8);
    const tempKartucuti =
      '##tempkartucuti' + Math.random().toString(36).substring(2, 8);
    const tempListData =
      '##Templistdata' + Math.random().toString(36).substring(2, 8);
    const tempDataHasil =
      '##tempdatahasil' + Math.random().toString(36).substring(2, 8);
    const tempJatahCuti =
      '##tempjatahcuti' + Math.random().toString(36).substring(2, 8);
    const tempSisaCuti =
      '##tempsisacuti' + Math.random().toString(36).substring(2, 8);
    const tempJatahCutiHasil =
      '##Tempjatahcutihasil' + Math.random().toString(36).substring(2, 8);
    const tempJatahCutiHasil2 =
      '##Tempjatahcutihasil2' + Math.random().toString(36).substring(2, 8);
    const tempCekHangusCutiAkhir =
      '##tempcekhanguscutiakhir_' + Math.random().toString(36).substring(2, 8);
    // Create temporary tables
    await trx.schema.createTable(tempCuti, (t) => {
      t.integer('id');
      t.datetime('tglcuti');
      t.datetime('tglpengajuan');
    });
    await trx.schema.createTable(tempMinusCutiTable, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('periodedaribanding');
      t.datetime('periodesampaibanding');
      t.integer('minuscuti');
    });
    await trx.schema.createTable(tempMinusCutiTable2, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('periodedaribanding');
      t.datetime('periodesampaibanding');
      t.integer('minuscutiperiode');
      t.integer('minuscuti');
    });
    await trx.schema.createTable(tempSaldoCuti, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });

    await trx.schema.createTable(tempHangusCuti2, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.integer('hanguscuti');
    });

    await trx.schema.createTable(tempHangusCuti, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.integer('hanguscuti');
    });

    await trx.schema.createTable(tempKartucuti, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglbukti');
      t.datetime('tglbukti2');
      t.string('jenistransaksi', 1000);
      t.integer('masuk');
      t.integer('keluar');
      t.integer('keluarprediksi');
      t.integer('typedata');
      t.integer('nonkartucuti');
      t.integer('cutiid');
    });

    await trx.schema.createTable(tempListData, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglbukti');
      t.datetime('tglbukti2');
      t.string('jenistransaksi');
      t.integer('masuk');
      t.integer('keluar');
      t.integer('keluarprediksi');
      t.integer('qtysaldo');
      t.integer('qtysaldoprediksi');
      t.integer('typedata');
      t.integer('cuti_id');
      t.datetime('tglpengajuan');
    });

    await trx.schema.createTable(tempDataHasil, (t) => {
      t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglbukti');
      t.string('jenistransaksi');
      t.integer('masuk');
      t.integer('keluar');
      t.integer('keluarprediksi');
      t.integer('saldo');
      t.integer('saldoprediksi');
      t.integer('cuti_id');
      t.integer('typedata');
      t.integer('prediksicuti');
    });

    await trx.schema.createTable(tempJatahCuti, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('tglbukti');
      t.string('jenistransaksi');
      t.integer('jatahcuti');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });

    await trx.schema.createTable(tempSisaCuti, (t) => {
      t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
      t.integer('cuti_id');
      t.integer('karyawan_id');
      t.datetime('tglbukti');
      t.text('jenistransaksi'); // varchar(100) pada SQL Server
      t.integer('cuti');
      t.integer('saldo');
      t.integer('saldoprediksi');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglpengajuan'); // Ditambahkan sesuai dengan schema SQL Server
      t.string('key', 100); // varchar(100) pada SQL Server, ditambahkan sesuai dengan schema SQL Server
    });

    await trx.schema.createTable(tempJatahCutiHasil, (t) => {
      t.string('key', 100); // varchar(100) pada SQL Server, ditambahkan sesuai dengan schema SQL Server
      t.integer('cuti_id');
      t.integer('karyawan_id');
      t.integer('id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });

    await trx.schema.createTable(tempJatahCutiHasil2, (t) => {
      t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
      t.integer('cuti_id');
      t.integer('karyawan_id');
      t.integer('jatahcuti');
      t.integer('sisacuti');
      t.integer('prediksicuti');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });
    // Step 4: Insert into #tempkartucuti
    await trx(tempCuti).insert(
      trx
        .select('A.id', 'B.tglcuti', 'A.created_at as tglpengajuan')
        .from('cuti AS A')
        .innerJoin('cutidetail AS B', 'A.id', 'B.cuti_id')
        .where('A.karyawan_id', '=', trx.raw('?', id)) // Gunakan whereIn untuk filter berdasarkan array karyawanIds
        .andWhereRaw('(ISNULL(A.statuscutibatal, 0)) <> 153')
        .andWhereRaw('(ISNULL(A.statuscuti, 0)) NOT IN (153,152)')
        .orderBy('A.id'),
    );
    const minusCuti = await trx(`karyawan as a`)
      .select('c.minuscuti')
      .innerJoin('cabang as c', 'a.cabang_id', 'c.id')
      .where('a.id', id)
      .first();

    await trx(tempMinusCutiTable).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.periodetgldari',
          'A.periodetglsampai',
          trx.raw('DATEADD(YEAR, 1, A.periodetgldari) AS periodedaribanding'),
          trx.raw(
            'DATEADD(YEAR, 1, A.periodetglsampai) AS periodesampaibanding',
          ),
          trx.raw(
            'SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS minuscuti',
          ),
        )
        .from('kartucuti AS A')
        .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
        .whereRaw(
          "A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)",
        )
        .andWhere('A.karyawan_id', '=', trx.raw('?', id)) // memastikan id yang dikirim adalah array
        .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
        .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152)')
        .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
    );

    if (minusCuti.minuscuti == 164) {
      await trx(tempMinusCutiTable).delete().whereRaw('minuscuti > 0');
      await trx(tempMinusCutiTable2).insert(
        trx
          .select(
            'karyawan_id',
            'periodedari',
            'periodesampai',
            'periodedaribanding',
            'periodesampaibanding',
            'minuscuti as minuscutiperiode',
            trx.raw(
              'SUM(ISNULL(minuscuti, 0)) OVER(PARTITION BY karyawan_id ORDER BY karyawan_id,periodedari ASC) as minuscuti',
            ),
          )
          .from(tempMinusCutiTable),
      );
    }

    await trx(tempSaldoCuti)
      .insert(
        trx
          .select('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai')
          .from('kartucuti AS A')
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .where('A.jenistransaksi', '=', 'saldo cuti')
          .andWhere('A.karyawan_id', '=', trx.raw('?', id))
          .andWhereRaw('(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) > 0')
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152)')
          .andWhereRaw('(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) > 0'),
      )
      .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai');

    await trx(tempHangusCuti2).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.periodetgldari',
          'A.periodetglsampai',
          trx.raw(
            'SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS hanguscuti',
          ),
        )
        .from('kartucuti AS A')
        .innerJoin(`${tempSaldoCuti} AS B`, function () {
          this.on('A.karyawan_id', '=', 'B.karyawan_id')
            .andOn('A.periodetgldari', '=', 'B.periodedari')
            .andOn('A.periodetglsampai', '=', 'B.periodesampai');
        })
        .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')

        .whereRaw(
          "A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)",
        )
        .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
        .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152)')
        .andWhere('A.karyawan_id', '=', trx.raw('?', id))
        .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
    );

    // Deleting invalid entries in #temphanguscuti2
    if (minusCuti.minuscuti == 164) {
      await trx(tempHangusCuti2).delete().whereRaw('hanguscuti <= 0');
    } else {
      await trx(tempHangusCuti2).delete().whereRaw('hanguscuti = 0');
    }
    // Insert into #temphanguscuti

    if (minusCuti.minuscuti == 164) {
      await trx(tempHangusCuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodedari',
            'A.periodesampai',
            trx.raw(
              'ISNULL(A.hanguscuti, 0) + ISNULL(B.minuscuti, 0) AS hanguscuti',
            ),
          )
          .from(`${tempHangusCuti2} AS A`)
          .leftJoin(`${tempMinusCutiTable2} AS B`, function () {
            this.on('A.karyawan_id', '=', 'B.karyawan_id')
              .andOn('A.periodedari', '=', 'B.periodedaribanding')
              .andOn('A.periodesampai', '=', 'B.periodesampaibanding');
          }),
      );
    } else {
      await trx(tempHangusCuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodedari',
            'A.periodesampai',
            trx.raw('ISNULL(A.hanguscuti, 0) AS hanguscuti'),
          )
          .from(`${tempHangusCuti2} AS A`),
      );
    }
    // Deleting invalid entries in #temphanguscuti
    if (minusCuti.minuscuti == 164) {
      await trx(tempHangusCuti).delete().whereRaw('hanguscuti <= 0');
    }

    // Insert into #tempkartucuti
    await trx(tempKartucuti).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.periodetgldari',
          'A.periodetglsampai',
          'A.tgltransaksi',
          'A.tgltransaksi as tglbukti2',
          'A.jenistransaksi',
          'A.masuk',
          'A.keluar as keluar',
          'A.keluar as keluarprediksi',
          trx.raw(
            "CASE WHEN A.jenistransaksi = 'SALDO CUTI' THEN 1 ELSE 3 END AS typedata",
          ),
          trx.raw('0 AS nonkartucuti'),
          trx.raw('0 AS cutiid'),
        )

        .from('kartucuti AS A')
        .leftOuterJoin('cuti as b', 'A.cuti_id', 'b.id')
        // .whereRaw('(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) <> 0')
        .andWhereRaw('(ISNULL(b.statuscutibatal, 0)) <> 153')
        .andWhereRaw('(ISNULL(b.statuscuti, 0)) NOT IN (153,152)')
        .andWhere('A.karyawan_id', '=', trx.raw('?', id))
        .orderBy('A.tgltransaksi'),
    );

    // Insert into #tempkartucuti for 'hangus cuti'
    await trx(tempKartucuti).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.periodedari',
          'A.periodesampai',
          trx.raw('A.periodesampai AS tglbukti'),
          trx.raw('A.periodesampai AS tglbukti2'),
          trx.raw("'hangus cuti' AS jenistransaksi"),
          trx.raw('0 AS masuk'),
          trx.raw('ISNULL(A.hanguscuti, 0) AS keluar'),
          trx.raw('ISNULL(A.hanguscuti, 0) AS keluarprediksi'),
          trx.raw('5 AS typedata'), // Added typedata as in the original SQL query
          trx.raw('0 AS nonkartucuti'),
          trx.raw('0 AS cutiid'),
        )
        .from(`${tempHangusCuti} AS A`),
    );

    await trx(tempKartucuti).insert(
      trx
        .select(
          'A.karyawan_id',
          'B.periodecutidari as periodedari',
          'B.periodecutisampai as periodesampai',
          trx.raw('B.tglcuti AS tglbukti'),
          trx.raw('B.tglcuti AS tglbukti2'),
          trx.raw('A.alasancuti AS jenistransaksi'),
          trx.raw('0 AS masuk'),
          trx.raw('0 AS keluar'),
          trx.raw(
            '(CASE WHEN ISNULL(A.statusnonhitung, 147) IN (147,150) THEN 1 else 0 END) as keluarprediksi',
          ),
          trx.raw('4 AS typedata'), // Added typedata as in the original SQL query
          trx.raw('1 AS nonkartucuti'),
          trx.raw('0 AS cutiid'),
        )
        .from('cuti AS A')
        .innerJoin('cutidetail AS B', function () {
          this.on('A.id', '=', 'B.cuti_id');
        })
        .leftOuterJoin('kartucuti as C', function () {
          this.on('A.karyawan_id', '=', 'C.karyawan_id')
            .andOn('A.id', '=', 'C.cuti_id')
            .andOn(
              trx.raw("c.jenistransaksi NOT IN ('SALDO CUTI', 'HANGUS CUTI')"),
            );
        })
        .whereRaw('COALESCE(C.cuti_id, 0) = 0') // Using COALESCE instead of ISNULL
        // .andWhereRaw('COALESCE(A.statusnonhitung, 147) = 147') // Fixed the where clause
        .andWhereRaw('(ISNULL(A.statuscutibatal, 0)) <> 153')
        .andWhereRaw('(ISNULL(A.statuscuti, 0)) NOT IN (153,152)')
        .andWhere('A.karyawan_id', '=', trx.raw('?', id))
        .orderBy('B.tglcuti', 'desc'), // memastikan id yang dikirim adalah array
    );

    // Insert into #Templistdata
    await trx(tempListData).insert(
      trx
        .select(
          'a.karyawan_id',
          'a.periodedari',
          'a.periodesampai',
          'a.tglbukti',
          'a.tglbukti2',
          'a.jenistransaksi',
          'a.masuk',
          'a.keluar',
          'a.keluarprediksi',
          trx.raw(
            'SUM(a.masuk - a.keluar) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END) ASC) AS qtysaldo',
          ),
          trx.raw(
            'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END) ASC) AS qtysaldoprediksi',
          ),
          'a.typedata',
          trx.raw('ISNULL(b.id, 0) AS cuti_id'),
          trx.raw("ISNULL(b.tglpengajuan, '1900-01-01') AS tglpengajuan"),
        )
        .from(`${tempKartucuti} AS a`)
        .leftJoin(`${tempCuti} AS b`, function () {
          this.on('a.tglbukti', '=', 'b.tglcuti').andOn(
            'a.typedata',
            '=',
            trx.raw('?', [3]),
          );
        })
        .orderBy('a.karyawan_id')
        .orderBy(
          trx.raw(
            'CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti ELSE b.tglpengajuan END',
          ),
        ),
    );

    if (minusCuti.minuscuti == 164) {
      await trx(tempKartucuti)
        .join(`${tempListData} AS b`, function () {
          this.on(`${tempKartucuti}.karyawan_id`, '=', 'b.karyawan_id')
            .andOn(`${tempKartucuti}.periodedari`, '=', 'b.periodedari')
            .andOn(`${tempKartucuti}.periodesampai`, '=', 'b.periodesampai');
        })
        .where(`${tempKartucuti}.jenistransaksi`, 'HANGUS CUTI')
        .andWhere('b.qtysaldo', '<', 0)
        .del();

      await trx(tempListData).del();
      await trx(tempListData).insert(
        trx
          .select(
            'a.karyawan_id',
            'a.periodedari',
            'a.periodesampai',
            'a.tglbukti',
            'a.tglbukti2',
            'a.jenistransaksi',
            'a.masuk',
            'a.keluar',
            'a.keluarprediksi',
            trx.raw(
              'SUM(a.masuk - a.keluar) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END) ASC) AS qtysaldo',
            ),
            trx.raw(
              'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END) ASC) AS qtysaldoprediksi',
            ),
            'a.typedata',
            trx.raw('ISNULL(b.id, 0) AS cuti_id'),
            trx.raw("ISNULL(b.tglpengajuan, '1900-01-01') AS tglpengajuan"),
          )
          .from(`${tempKartucuti} AS a`)
          .leftJoin(`${tempCuti} AS b`, function () {
            this.on('a.tglbukti', '=', 'b.tglcuti').andOn(
              'a.typedata',
              '=',
              trx.raw('?', [3]),
            );
          })
          .orderBy('a.karyawan_id')
          .orderBy(
            trx.raw(
              'CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti ELSE b.tglpengajuan END',
            ),
          ),
      );
    } else {
      await trx.schema.createTable(tempCekHangusCutiAkhir, (t) => {
        t.integer('karyawan_id');
        t.text('jenistransaksi');
        t.integer('id');
      });

      await trx(tempCekHangusCutiAkhir).insert(
        trx
          .select(
            'karyawan_id',
            trx.raw('NULL as jenistransaksi'),
            trx.raw('MAX(id) as id'),
          )
          .from(`${tempListData} AS A`)
          .groupBy('karyawan_id'), // Add 'jenistransaksi' to the group by clause
      );

      await trx(tempListData)
        .join(`${tempCekHangusCutiAkhir} AS b`, function () {
          this.on(`${tempListData}.karyawan_id`, '=', 'b.karyawan_id').andOn(
            `${tempListData}.id`,
            '=',
            'b.id',
          );
        })
        .whereRaw('UPPER(??) = ?', [
          `${tempListData}.jenistransaksi`,
          'HANGUS CUTI',
        ]) // Use whereRaw to properly handle the UPPER function
        .del();
    }

    // Insert into #tempdatahasil
    await trx(tempDataHasil).insert(
      trx
        .select(
          'a.karyawan_id',
          'a.periodedari',
          'a.periodesampai',
          'a.tglbukti',
          'a.jenistransaksi',
          'a.masuk',
          'a.keluar',
          'a.keluarprediksi',
          trx.raw(
            'SUM(a.masuk - a.keluar) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,tglbukti, (CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti ELSE a.tglpengajuan END) ASC) AS saldo',
          ),
          trx.raw(
            'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,tglbukti, (CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti ELSE a.tglpengajuan END) ASC) AS saldoprediksi',
          ),
          'a.cuti_id',
          'a.typedata',
          trx.raw(
            'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,tglbukti, (CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti ELSE a.tglpengajuan END) ASC) AS prediksicuti',
          ),
        )
        .from(`${tempListData} AS a`)
        .where('A.karyawan_id', '=', trx.raw('?', id))
        .orderBy('a.karyawan_id')
        .orderBy(
          trx.raw(
            '(CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti ELSE a.tglpengajuan END)',
          ),
        ),
    );
    // console.log('tempCuti', await trx(tempDataHasil));

    // Insert into #tempjatahcuti
    await trx(tempJatahCuti).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.tglbukti',
          'A.jenistransaksi',
          'A.masuk AS jatahcuti',
          'A.periodedari',
          'A.periodesampai',
        )
        .from(`${tempDataHasil} AS A`)
        .where('A.masuk', '<>', 0)
        .orderBy('A.tglbukti'),
    );

    // Insert into #tempsisacuti
    await trx(tempSisaCuti).insert(
      trx
        .select(
          'b.cuti_id',
          'a.karyawan_id',
          'a.tglbukti',
          'a.jenistransaksi',
          'a.keluar as cuti',
          'a.saldo as saldo',
          'a.saldoprediksi as saldoprediksi',
          'a.periodedari',
          'a.periodesampai',
          trx.raw('c.tglpengajuan'),
          trx.raw(
            "FORMAT(c.tglpengajuan, 'yyyyMMdd') + REPLICATE('0', 10 - LEN(TRIM(STR(c.id)))) + TRIM(STR(c.id)) as [key]",
          ),
        )
        .from(`${tempDataHasil} AS a`)
        .innerJoin('cuti AS c', 'a.karyawan_id', 'c.karyawan_id')
        .innerJoin('cutidetail AS b', function () {
          this.on('a.tglbukti', '=', 'b.tglcuti').andOn(
            'c.id',
            '=',
            'b.cuti_id',
          );
        })
        // .where('a.keluar', '<>', 0)
        .where(trx.raw("ISNULL(a.jenistransaksi, '') <> 'hangus cuti'"))
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutidari, '1900-01-01')) <> 1900"),
        )
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutisampai, '1900-01-01')) <> 1900"),
        )
        .orderBy('a.id'),
    );
    await trx(tempSisaCuti).insert(
      trx
        .select(
          'b.cuti_id',
          'a.karyawan_id',
          'a.tglbukti',
          'a.jenistransaksi',
          'a.keluar as cuti',
          'a.saldo as saldo',
          'a.saldoprediksi as saldoprediksi',
          'a.periodedari',
          'a.periodesampai',
          trx.raw('c.tglpengajuan'),
          trx.raw(
            "FORMAT(c.tglpengajuan, 'yyyyMMdd') + REPLICATE('0', 10 - LEN(TRIM(STR(c.id)))) + TRIM(STR(c.id)) as [key]",
          ),
        )
        .from(`${tempDataHasil} AS a`)
        .innerJoin('cuti AS c', 'a.karyawan_id', 'c.karyawan_id')
        .innerJoin('cutidetail AS b', function () {
          this.on('a.tglbukti', '=', 'b.tglcuti').andOn(
            'c.id',
            '=',
            'b.cuti_id',
          );
        })
        .where('a.typedata', '=', 4)
        .andWhere(trx.raw("ISNULL(a.jenistransaksi, '') <> 'hangus cuti'"))
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutidari, '1900-01-01')) <> 1900"),
        )
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutisampai, '1900-01-01')) <> 1900"),
        )
        .orderBy('a.id'),
    );

    // Insert into #Tempjatahcutihasil
    await trx(tempJatahCutiHasil).insert(
      trx
        .select(
          'A.key',
          'A.cuti_id',
          'A.karyawan_id',
          trx.raw('MAX(A.id) AS id'),
          'A.periodedari',
          'A.periodesampai',
        )
        .from(`${tempSisaCuti} AS A`)
        .groupBy(
          'A.key',
          'A.cuti_id',
          'A.karyawan_id',
          'A.periodedari',
          'A.periodesampai',
        ),
    );

    // Insert into #Tempjatahcutihasil2
    await trx(tempJatahCutiHasil2).insert(
      trx
        .select(
          trx.raw(
            'A.cuti_id, A.karyawan_id, ISNULL(C.jatahcuti, 0) AS jatahcuti, B.saldo AS sisacuti, b.saldoprediksi as prediksicuti,b.periodedari,b.periodesampai',
          ),
        )
        .from(`${tempJatahCutiHasil} AS A`)
        .innerJoin(`${tempSisaCuti} AS B`, 'A.id', 'B.id')
        .leftJoin(`${tempJatahCuti} AS C`, function () {
          this.on('A.karyawan_id', '=', 'C.karyawan_id')
            .andOn('C.periodedari', '=', 'B.periodedari')
            .andOn('C.periodesampai', '=', 'B.periodesampai');
        })
        .orderBy('A.cuti_id')
        .orderBy('A.karyawan_id'),
    );
    if (isoverview == 1) {
      const cuti = await trx(tempJatahCutiHasil2)
        .select('cuti_id')
        .whereRaw('YEAR(periodedari) = YEAR(GETDATE())');

      if (cuti.length <= 0) {
        await trx.raw(
          `INSERT INTO ?? (cuti_id, karyawan_id, sisacuti, jatahcuti, prediksicuti, periodedari, periodesampai)
         SELECT 0 as cuti_id, ? as karyawan_id, saldo as sisacuti, saldo as jatahcuti, saldo as prediksicuti, periodetgldari as periodedari, periodetglsampai as periodesampai
         FROM saldocuti
         WHERE karyawan_id = ? AND YEAR(periodetgldari) = YEAR(GETDATE())`,
          [tempJatahCutiHasil2, id, id],
        );
      }
      return tempJatahCutiHasil2;
    } else {
      return tempJatahCutiHasil2;
    }
  }
  async rekapCutiAllKaryawan(
    id: string[],
    tahun: any,
    isproses: any,
    iskartucuti: any,
    trx: any,
  ) {
    let tglakhir: Date; // Keep it as a Date object
    // Check if iskartucuti is 1 (equivalent to SQL @piskartucuti)
    const currentYear = new Date().getFullYear();

    // Check if iskartucuti is 1 (equivalent to SQL @piskartucuti)
    if (iskartucuti == 1) {
      // Check if tahun is current year or 0
      if (tahun == 0 || tahun == currentYear) {
        // Set tglakhir to December 31st of the current year
        tglakhir = new Date(Date.UTC(currentYear, 11, 31)); // December 31st of the current year at UTC midnight
        tglakhir.setDate(tglakhir.getDate() - 1); // Subtract 1 day to match SQL logic
      } else {
        // Set tglakhir to December 31st of the given year
        tglakhir = new Date(Date.UTC(tahun, 11, 31)); // December 31st of the given year at UTC midnight
      }
    } else {
      // If iskartucuti is not 1
      if (tahun == 0) {
        // Use the current date and reset time to midnight (same logic as SQL)
        tglakhir = new Date(Date.UTC(currentYear, 11, 31)); // December 31st of the current year at UTC midnight
        tglakhir.setDate(tglakhir.getDate()); // Subtract 1 day to match SQL logic
      } else {
        // Set tglakhir to December 31st of the given year
        tglakhir = new Date(Date.UTC(tahun, 11, 31)); // December 31st of the given year at UTC midnight
      }
    }

    const formattedTglakhir = tglakhir;

    //
    const tempKaryawanId =
      '##temp_karyawan_' + Math.random().toString(36).substring(2, 8);
    const tempCuti =
      '##temp_cuti_' + Math.random().toString(36).substring(2, 8);
    const tempMinusCutiTable =
      '##temp_minuscuti_' + Math.random().toString(36).substring(2, 8);
    const tempMinusCutiTable2 =
      '##temp_minuscuti2_' + Math.random().toString(36).substring(2, 8);
    const tempSaldoCuti =
      '##Tempsaldocuti' + Math.random().toString(36).substring(2, 8);
    const tempHangusCuti2 =
      '##temphanguscuti2' + Math.random().toString(36).substring(2, 8);
    const tempHangusCuti =
      '##temphanguscuti' + Math.random().toString(36).substring(2, 8);
    const tempCekHangusCutiAkhir =
      '##tempcekhanguscutiakhir_' + Math.random().toString(36).substring(2, 8);
    const tempKartucuti =
      '##tempkartucuti' + Math.random().toString(36).substring(2, 8);
    const tempListData =
      '##Templistdata' + Math.random().toString(36).substring(2, 8);
    const tempDataHasil =
      '##tempdatahasil' + Math.random().toString(36).substring(2, 8);
    const tempJatahCuti =
      '##tempjatahcuti' + Math.random().toString(36).substring(2, 8);
    const tempSisaCuti =
      '##tempsisacuti' + Math.random().toString(36).substring(2, 8);
    const tempJatahCutiHasil =
      '##Tempjatahcutihasil' + Math.random().toString(36).substring(2, 8);
    const tempJatahCutiHasil2 =
      '##Tempjatahcutihasil2' + Math.random().toString(36).substring(2, 8);
    const Tempdataurut =
      '##Tempdataurut' + Math.random().toString(36).substring(2, 8);
    const Tempkartucutilaporan =
      '##Tempkartucutilaporan' + Math.random().toString(36).substring(2, 8);
    const TempkartucutilaporanRekap =
      '##TempkartucutilaporanRekap' +
      Math.random().toString(36).substring(2, 8);
    const Tempterpakai =
      '##Tempterpakai' + Math.random().toString(36).substring(2, 8);
    // Create temporary tables
    await trx.schema.createTable(tempKaryawanId, (t) => {
      t.integer('karyawan_id');
    });
    await trx.schema.createTable(Tempterpakai, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.integer('id2');
    });

    await trx.schema.createTable(tempCuti, (t) => {
      t.integer('id');
      t.integer('karyawan_id');
      t.datetime('tglcuti');
      t.datetime('tglpengajuan');
    });
    await trx.schema.createTable(tempMinusCutiTable, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('periodedaribanding');
      t.datetime('periodesampaibanding');
      t.integer('minuscuti');
    });
    await trx.schema.createTable(tempMinusCutiTable2, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('periodedaribanding');
      t.datetime('periodesampaibanding');
      t.integer('minuscutiperiode');
      t.integer('minuscuti');
    });

    await trx.schema.createTable(tempSaldoCuti, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });

    await trx.schema.createTable(tempHangusCuti2, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.integer('hanguscuti');
    });

    await trx.schema.createTable(tempHangusCuti, (t) => {
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.integer('hanguscuti');
    });

    await trx.schema.createTable(tempKartucuti, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglbukti');
      t.datetime('tglbukti2');
      t.string('jenistransaksi', 1000);
      t.integer('masuk');
      t.integer('keluar');
      t.integer('keluarprediksi');
      t.integer('typedata');
      t.integer('nonkartucuti');
      t.integer('cutiid');
    });

    await trx.schema.createTable(tempListData, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglbukti');
      t.datetime('tglbukti2');
      t.string('jenistransaksi');
      t.integer('masuk');
      t.integer('keluar');
      t.integer('keluarprediksi');
      t.integer('qtysaldo');
      t.integer('qtysaldoprediksi');
      t.integer('typedata');
      t.integer('cuti_id');
      t.datetime('tglpengajuan');
    });
    await trx.schema.createTable(tempDataHasil, (t) => {
      t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
      t.integer('karyawan_id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglbukti');
      t.text('jenistransaksi');
      t.integer('masuk');
      t.integer('keluar');
      t.integer('keluarprediksi');
      t.integer('saldo');
      t.integer('saldoprediksi');
      t.integer('cuti_id');
      t.integer('typedata');
    });

    await trx.schema.createTable(tempJatahCuti, (t) => {
      t.increments('id').primary();
      t.integer('karyawan_id');
      t.datetime('tglbukti');
      t.string('jenistransaksi');
      t.integer('jatahcuti');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });

    await trx.schema.createTable(tempSisaCuti, (t) => {
      t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
      t.integer('cuti_id');
      t.integer('karyawan_id');
      t.datetime('tglbukti');
      t.text('jenistransaksi'); // varchar(100) pada SQL Server
      t.integer('cuti');
      t.integer('saldo');
      t.integer('saldoprediksi');
      t.datetime('periodedari');
      t.datetime('periodesampai');
      t.datetime('tglpengajuan'); // Ditambahkan sesuai dengan schema SQL Server
      t.string('key', 100); // varchar(100) pada SQL Server, ditambahkan sesuai dengan schema SQL Server
    });

    await trx.schema.createTable(tempJatahCutiHasil, (t) => {
      t.string('key', 100); // varchar(100) pada SQL Server, ditambahkan sesuai dengan schema SQL Server
      t.integer('cuti_id');
      t.integer('karyawan_id');
      t.integer('id');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });

    await trx.schema.createTable(tempJatahCutiHasil2, (t) => {
      t.integer('cuti_id');
      t.integer('karyawan_id');
      t.integer('jatahcuti');
      t.integer('sisacuti');
      t.integer('prediksicuti');
      t.integer('urut');
      t.datetime('periodedari');
      t.datetime('periodesampai');
    });
    await trx.schema.createTable(Tempdataurut, (t) => {
      t.integer('karyawan_id');
      t.integer('urut');
    });

    // Step 4: Insert into #tempkartucuti
    await trx(tempKaryawanId).insert(
      id.map((karyawanId) => ({
        karyawan_id: Number(karyawanId),
      })),
    );
    const minusCuti = await trx(`${tempKaryawanId} as a`)
      .select('c.minuscuti')
      .innerJoin('karyawan as b', 'a.karyawan_id', 'b.id')
      .innerJoin('cabang as c', 'b.cabang_id', 'c.id')
      .first();

    if (iskartucuti == 1) {
      await trx(tempCuti).insert(
        trx
          .select(
            'A.id',
            'A.karyawan_id',
            'B.tglcuti',
            'A.created_at as tglpengajuan',
          )
          .from('cuti AS A')
          .innerJoin('cutidetail AS B', 'A.id', 'B.cuti_id')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .where('b.tglcuti', '<', tglakhir)
          .andWhereRaw('ISNULL(A.statuscutibatal, 0) <> 153')
          .andWhereRaw('ISNULL(A.statuscuti, 0) NOT IN (153,152,150)')
          .orderBy('A.id'),
      );
    } else {
      await trx(tempCuti).insert(
        trx
          .select(
            'A.id',
            'A.karyawan_id',
            'B.tglcuti',
            'A.created_at as tglpengajuan',
          )
          .from('cuti AS A')
          .innerJoin('cutidetail AS B', 'A.id', 'B.cuti_id')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .where('b.tglcuti', '<', tglakhir)
          .andWhereRaw('(ISNULL(A.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(A.statuscuti, 0)) NOT IN (153,152)')
          .orderBy('A.id'),
      );
    }
    if (iskartucuti == 1) {
      await trx(tempMinusCutiTable).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            trx.raw(
              `CAST(
              TRIM(STR(YEAR(A.periodetgldari) + 1)) + 
              FORMAT(A.periodetgldari, '/MM/') + 
              CASE 
                WHEN CAST(YEAR(A.periodetgldari) + 1 AS MONEY) % 4 <> 0 
                  AND MONTH(A.periodetgldari) = 2 
                  AND DAY(A.periodetgldari) = 29 
                THEN '28' 
                ELSE FORMAT(A.periodetgldari, 'dd') 
              END AS DATETIME) AS periodedaribanding`,
            ),
            trx.raw(
              `CAST(
              TRIM(STR(YEAR(A.periodetglsampai) + 1)) + 
              FORMAT(A.periodetglsampai, '/MM/') + 
              CASE 
                WHEN CAST(YEAR(A.periodetglsampai) + 1 AS MONEY) % 4 <> 0 
                  AND MONTH(A.periodetglsampai) = 2 
                  AND DAY(A.periodetglsampai) = 29 
                THEN '28' 
                ELSE FORMAT(A.periodetglsampai, 'dd') 
              END AS DATETIME) AS periodesampaibanding`,
            ),
            trx.raw(
              'SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS minuscuti',
            ),
          )
          .from('kartucuti AS A')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .whereRaw(
            "A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)",
          )
          .andWhere('A.tgltransaksi', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152,150)')
          .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
      );
    } else {
      await trx(tempMinusCutiTable).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            trx.raw(
              `CAST(
              TRIM(STR(YEAR(A.periodetgldari) + 1)) + 
              FORMAT(A.periodetgldari, '/MM/') + 
              CASE 
                WHEN CAST(YEAR(A.periodetgldari) + 1 AS MONEY) % 4 <> 0 
                  AND MONTH(A.periodetgldari) = 2 
                  AND DAY(A.periodetgldari) = 29 
                THEN '28' 
                ELSE FORMAT(A.periodetgldari, 'dd') 
              END AS DATETIME) AS periodedaribanding`,
            ),
            trx.raw(
              `CAST(
              TRIM(STR(YEAR(A.periodetglsampai) + 1)) + 
              FORMAT(A.periodetglsampai, '/MM/') + 
              CASE 
                WHEN CAST(YEAR(A.periodetglsampai) + 1 AS MONEY) % 4 <> 0 
                  AND MONTH(A.periodetglsampai) = 2 
                  AND DAY(A.periodetglsampai) = 29 
                THEN '28' 
                ELSE FORMAT(A.periodetglsampai, 'dd') 
              END AS DATETIME) AS periodesampaibanding`,
            ),
            trx.raw(
              'SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS minuscuti',
            ),
          )
          .from('kartucuti AS A')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .whereRaw(
            "A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)",
          )
          .andWhere('A.tgltransaksi', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152)')
          .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
      );
    }
    // console.log('tempMinusCutiTable', await trx(tempMinusCutiTable));
    if (minusCuti.minuscuti == 164) {
      await trx(tempMinusCutiTable).del().whereRaw('minuscuti > 0');

      await trx(tempMinusCutiTable2).insert(
        trx
          .select(
            'karyawan_id',
            'periodedari',
            'periodesampai',
            'periodedaribanding',
            'periodesampaibanding',
            'minuscuti as minuscutiperiode',
            trx.raw(
              'SUM(ISNULL(minuscuti, 0)) OVER(PARTITION BY karyawan_id ORDER BY karyawan_id,periodedari ASC) as minuscuti',
            ),
          )
          .from(tempMinusCutiTable),
      );
    }

    // await trx(tempMinusCutiTable).delete().whereRaw('minuscuti > 0');
    // const datatempMinusCutiTable = await trx(tempMinusCutiTable);
    //

    if (iskartucuti == 1) {
      await trx(tempSaldoCuti).insert(
        trx
          .select('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai')
          .from('kartucuti AS A')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .where('A.jenistransaksi', '=', 'saldo cuti')
          .andWhereRaw('(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) > 0')
          .andWhere('A.tgltransaksi', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152,150)')
          .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
      );
    } else {
      await trx(tempSaldoCuti).insert(
        trx
          .select('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai')
          .from('kartucuti AS A')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .where('A.jenistransaksi', '=', 'saldo cuti')
          .andWhereRaw('(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) > 0')
          .andWhere('A.tgltransaksi', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152)')
          .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
      );
    }

    // const datatempMinusCutiTable = await trx(tempSaldoCuti);
    //
    if (iskartucuti == 1) {
      await trx(tempHangusCuti2).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            trx.raw(
              'SUM(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) AS hanguscuti',
            ),
          )
          .from('kartucuti AS A')
          .innerJoin(`${tempSaldoCuti} AS B`, function () {
            this.on('A.karyawan_id', '=', 'B.karyawan_id')
              .andOn('A.periodetgldari', '=', 'B.periodedari')
              .andOn('A.periodetglsampai', '=', 'B.periodesampai');
          })
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .where('A.periodetglsampai', '<=', formattedTglakhir)
          .andWhere('A.tgltransaksi', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152,150)')
          .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
      );
    } else {
      await trx(tempHangusCuti2).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            trx.raw(
              'SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS hanguscuti',
            ),
          )
          .from('kartucuti AS A')
          .innerJoin(`${tempSaldoCuti} AS B`, function () {
            this.on('A.karyawan_id', '=', 'B.karyawan_id')
              .andOn('A.periodetgldari', '=', 'B.periodedari')
              .andOn('A.periodetglsampai', '=', 'B.periodesampai');
          })
          .leftOuterJoin('cuti as d', 'A.cuti_id', 'd.id')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .where('A.periodetglsampai', '<=', formattedTglakhir)
          .andWhere('A.tgltransaksi', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(D.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(D.statuscuti, 0)) NOT IN (153,152)')
          .groupBy('A.karyawan_id', 'A.periodetgldari', 'A.periodetglsampai'),
      );
    }

    //
    if (minusCuti.minuscuti == 164) {
      await trx(tempHangusCuti2).delete().whereRaw('hanguscuti <= 0');
    } else {
      await trx(tempHangusCuti2).delete().whereRaw('hanguscuti = 0');
    }
    // Deleting invalid entries in #temphanguscuti2

    if (minusCuti.minuscuti == 164) {
      // Insert into #temphanguscuti
      await trx(tempHangusCuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodedari',
            'A.periodesampai',
            trx.raw(
              'ISNULL(A.hanguscuti, 0) + ISNULL(B.minuscuti, 0) AS hanguscuti',
            ),
          )
          .from(`${tempHangusCuti2} AS A`)
          .leftJoin(`${tempMinusCutiTable2} AS B`, function () {
            this.on('A.karyawan_id', '=', 'B.karyawan_id')
              .andOn('A.periodedari', '=', 'B.periodedaribanding')
              .andOn('A.periodesampai', '=', 'B.periodesampaibanding');
          }),
      );
    } else {
      await trx(tempHangusCuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodedari',
            'A.periodesampai',
            trx.raw('ISNULL(A.hanguscuti, 0) AS hanguscuti'),
          )
          .from(`${tempHangusCuti2} AS A`),
      );
    }

    // Deleting invalid entries in #temphanguscuti
    if (minusCuti.minuscuti == 164) {
      await trx(tempHangusCuti).delete().whereRaw('hanguscuti <= 0');
    }
    console.log(await trx('kartucuti').select('tgltransaksi'));

    // Insert into #tempkartucuti
    if (iskartucuti == 1) {
      await trx(tempKartucuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            'A.tgltransaksi',
            trx.raw(
              "(CASE WHEN A.jenistransaksi = 'SALDO CUTI' THEN CAST(A.periodetgldari AS DATETIME) ELSE CAST(A.tgltransaksi AS DATETIME) END) AS tglbukti2",
            ),
            'A.jenistransaksi',
            'A.masuk',
            'A.keluar as keluar',
            'A.keluar as keluarprediksi',
            trx.raw(
              "CASE WHEN A.jenistransaksi = 'SALDO CUTI' THEN 1 ELSE 3 END AS typedata",
            ),
            trx.raw('0 AS nonkartucuti'),
            trx.raw('0 AS cutiid'),
          )
          .from('kartucuti AS A')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti AS B', 'A.cuti_id', 'B.id')
          // Ensure valid dates are compared, and use proper ISNULL handling
          .andWhere(
            'A.tgltransaksi',
            '<',
            trx.raw('CAST(? AS DATETIME)', [formattedTglakhir]),
          ) // Cast formattedTglakhir to DATETIME
          .andWhereRaw('(ISNULL(B.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(B.statuscuti, 0)) NOT IN (153,152,150)')
          .orderBy('A.tgltransaksi'),
      );
      console.log('masok');
    } else {
      await trx(tempKartucuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            'A.tgltransaksi',
            trx.raw(
              "(CASE WHEN A.jenistransaksi = 'SALDO CUTI' THEN CAST(A.periodetgldari AS DATETIME) ELSE CAST(A.tgltransaksi AS DATETIME) END) AS tglbukti2",
            ),
            'A.jenistransaksi',
            'A.masuk',
            'A.keluar as keluar',
            'A.keluar as keluarprediksi',
            trx.raw(
              "CASE WHEN A.jenistransaksi = 'SALDO CUTI' THEN 1 ELSE 3 END AS typedata",
            ),
            trx.raw('0 AS nonkartucuti'),
            trx.raw('0 AS cutiid'),
          )
          .from('kartucuti AS A')
          .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
          .leftOuterJoin('cuti as b', 'A.cuti_id', 'b.id')
          // .whereRaw('(ISNULL(A.masuk, 0) - ISNULL(A.keluar, 0)) <> 0')
          .andWhere(
            'A.tgltransaksi',
            '<',
            trx.raw('CAST(? AS DATETIME)', [formattedTglakhir]),
          ) // Cast formattedTglakhir to DATETIME
          .andWhereRaw('(ISNULL(b.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(b.statuscuti, 0)) NOT IN (153,152)')
          .orderBy('A.tgltransaksi'),
      );
    }

    // Insert into #tempkartucuti for 'hangus cuti'
    await trx(tempKartucuti).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.periodedari',
          'A.periodesampai',
          trx.raw('A.periodesampai AS tglbukti'),
          trx.raw('A.periodesampai AS tglbukti2'),
          trx.raw("'hangus cuti' AS jenistransaksi"),
          trx.raw('0 AS masuk'),
          trx.raw('ISNULL(A.hanguscuti, 0) AS keluar'),
          trx.raw('ISNULL(A.hanguscuti, 0) AS keluarprediksi'),
          trx.raw('5 AS typedata'), // Added typedata as in the original SQL query
          trx.raw('0 AS nonkartucuti'),
          trx.raw('0 AS cutiid'),
        )
        .from(`${tempHangusCuti} AS A`),
    );

    if (iskartucuti == 1) {
      await trx(tempKartucuti).insert(
        trx
          .select(
            'A.karyawan_id',
            'B.periodecutidari as periodedari',
            'B.periodecutisampai as periodesampai',
            trx.raw('B.tglcuti AS tglbukti'),
            trx.raw('B.tglcuti AS tglbukti2'),
            trx.raw('A.alasancuti AS jenistransaksi'),
            trx.raw('0 AS masuk'),
            trx.raw('0 AS keluar'),
            trx.raw(
              '(CASE WHEN ISNULL(A.statusnonhitung, 147)=147 THEN 1 else 0 END) as keluarprediksi',
            ),
            trx.raw('4 AS typedata'), // Added typedata as in the original SQL query
            trx.raw('1 AS nonkartucuti'),
            trx.raw('0 AS cutiid'),
          )
          .from('cuti AS A')
          .innerJoin('cutidetail AS B', function () {
            this.on('A.id', '=', 'B.cuti_id');
          })
          .innerJoin(`${tempKaryawanId} AS D`, 'A.karyawan_id', 'D.karyawan_id')
          .leftOuterJoin('kartucuti as C', function () {
            this.on('A.karyawan_id', '=', 'C.karyawan_id')
              .andOn('A.id', '=', 'C.cuti_id')
              .andOn(
                trx.raw(
                  "c.jenistransaksi NOT IN ('SALDO CUTI', 'HANGUS CUTI')",
                ),
              );
          })
          .whereRaw('ISNULL(C.cuti_id,0)=0')
          // .whereRaw('COALESCE(C.cuti_id, 0) = 0') // Using COALESCE instead of ISNULL
          // .andWhereRaw('COALESCE(A.statusnonhitung, 147) = 147') // Fixed the where clause
          .andWhere('B.tglcuti', '<', formattedTglakhir)
          .andWhereRaw('(ISNULL(A.statuscutibatal, 0)) <> 153')
          .andWhereRaw('(ISNULL(A.statuscuti, 0)) NOT IN (153,152,150)')
          .orderBy('B.tglcuti'), // memastikan id yang dikirim adalah array
      );
    } else {
      if (tahun == 0 && isproses == 0 && iskartucuti == 0) {
        await trx(tempKartucuti).insert(
          trx
            .select(
              'A.karyawan_id',
              'B.periodecutidari as periodedari',
              'B.periodecutisampai as periodesampai',
              trx.raw('B.tglcuti AS tglbukti'),
              trx.raw('B.tglcuti AS tglbukti2'),
              trx.raw('A.alasancuti AS jenistransaksi'),
              trx.raw('0 AS masuk'),
              trx.raw('0 AS keluar'),
              trx.raw(
                '(CASE WHEN ISNULL(A.statusnonhitung, 147) in (147,150) THEN 1 else 0 END) as keluarprediksi',
              ),
              trx.raw('4 AS typedata'), // Added typedata as in the original SQL query
              trx.raw('1 AS nonkartucuti'),
              trx.raw('A.id AS cutiid'),
            )
            .from('cuti AS A')
            .innerJoin('cutidetail AS B', function () {
              this.on('A.id', '=', 'B.cuti_id');
            })
            .innerJoin(
              `${tempKaryawanId} AS D`,
              'A.karyawan_id',
              'D.karyawan_id',
            )
            .leftOuterJoin('kartucuti as C', function () {
              this.on('A.karyawan_id', '=', 'C.karyawan_id')
                .andOn('A.id', '=', 'C.cuti_id')
                .andOn(
                  trx.raw(
                    "c.jenistransaksi NOT IN ('SALDO CUTI', 'HANGUS CUTI')",
                  ),
                );
            })
            .whereRaw('ISNULL(C.cuti_id,0)=0')
            // .whereRaw('COALESCE(C.cuti_id, 0) = 0') // Using COALESCE instead of ISNULL
            // .andWhereRaw('COALESCE(A.statusnonhitung, 147) = 147') // Fixed the where clause
            // .andWhere('B.tglcuti', '<', formattedTglakhir)
            .andWhereRaw('(ISNULL(A.statuscutibatal, 0)) <> 153')
            .andWhereRaw('(ISNULL(A.statuscuti, 0)) NOT IN (153,152)')
            .orderBy('B.tglcuti', 'desc'), // memastikan id yang dikirim adalah array
        );
      } else {
        await trx(tempKartucuti).insert(
          trx
            .select(
              'A.karyawan_id',
              'B.periodecutidari as periodedari',
              'B.periodecutisampai as periodesampai',
              trx.raw('B.tglcuti AS tglbukti'),
              trx.raw('B.tglcuti AS tglbukti2'),
              trx.raw('A.alasancuti AS jenistransaksi'),
              trx.raw('0 AS masuk'),
              trx.raw('0 AS keluar'),
              trx.raw(
                '(CASE WHEN ISNULL(A.statusnonhitung, 147)=147 THEN 1 else 0 END) as keluarprediksi',
              ),
              trx.raw('4 AS typedata'), // Added typedata as in the original SQL query
              trx.raw('1 AS nonkartucuti'),
              trx.raw('0 AS cutiid'),
            )
            .from('cuti AS A')
            .innerJoin('cutidetail AS B', function () {
              this.on('A.id', '=', 'B.cuti_id');
            })
            .innerJoin(
              `${tempKaryawanId} AS D`,
              'A.karyawan_id',
              'D.karyawan_id',
            )
            .leftOuterJoin('kartucuti as C', function () {
              this.on('A.karyawan_id', '=', 'C.karyawan_id')
                .andOn('A.id', '=', 'C.cuti_id')
                .andOn(
                  trx.raw(
                    "c.jenistransaksi NOT IN ('SALDO CUTI', 'HANGUS CUTI')",
                  ),
                );
            })
            .whereRaw('ISNULL(C.cuti_id,0)=0')
            // .whereRaw('COALESCE(C.cuti_id, 0) = 0') // Using COALESCE instead of ISNULL
            // .andWhereRaw('COALESCE(A.statusnonhitung, 147) = 147') // Fixed the where clause
            .andWhere('B.tglcuti', '<', formattedTglakhir)
            .andWhereRaw('(ISNULL(A.statuscutibatal, 0)) <> 153')
            .andWhereRaw('(ISNULL(A.statuscuti, 0)) NOT IN (153,152)')
            .orderBy('B.tglcuti', 'desc'), // memastikan id yang dikirim adalah array
        );
      }
    }
    await trx(tempListData).insert(
      trx
        .select(
          'a.karyawan_id',
          'a.periodedari',
          'a.periodesampai',
          'a.tglbukti',
          'a.tglbukti2',
          'a.jenistransaksi',
          'a.masuk',
          'a.keluar',
          'a.keluarprediksi',
          trx.raw(
            'SUM(a.masuk - a.keluar) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti2, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END),a.typedata ASC) AS qtysaldo',
          ),
          trx.raw(
            'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti2, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END),a.typedata ASC) AS qtysaldoprediksi',
          ),
          'a.typedata',
          trx.raw('ISNULL(b.id, 0) AS cuti_id'),
          trx.raw("ISNULL(b.tglpengajuan, '1900-01-01') AS tglpengajuan"),
        )
        .from(`${tempKartucuti} AS a`)
        .leftJoin(`${tempCuti} AS b`, function () {
          this.on('a.tglbukti', '=', 'b.tglcuti')
            .andOn('a.typedata', '=', trx.raw('?', [3]))
            .andOn('a.karyawan_id', '=', 'b.karyawan_id');
        })
        .orderBy('a.karyawan_id')
        .orderBy(
          trx.raw(
            '(CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END),a.typedata',
          ),
        ),
    );

    if (minusCuti.minuscuti == 164) {
      await trx(tempKartucuti)
        .join(`${tempListData} AS b`, function () {
          this.on(`${tempKartucuti}.karyawan_id`, '=', 'b.karyawan_id')
            .andOn(`${tempKartucuti}.periodedari`, '=', 'b.periodedari')
            .andOn(`${tempKartucuti}.periodesampai`, '=', 'b.periodesampai');
        })
        .where(`${tempKartucuti}.jenistransaksi`, 'HANGUS CUTI')
        .andWhere('b.qtysaldo', '<', 0)
        .del();
      await trx(tempListData).del();
      await trx(tempListData).insert(
        trx
          .select(
            'a.karyawan_id',
            'a.periodedari',
            'a.periodesampai',
            'a.tglbukti',
            'a.tglbukti2',
            'a.jenistransaksi',
            'a.masuk',
            'a.keluar',
            'a.keluarprediksi',
            trx.raw(
              'SUM(a.masuk - a.keluar) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END), a.typedata ASC) AS qtysaldo',
            ),
            trx.raw(
              'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id, (CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END), a.typedata ASC) AS qtysaldoprediksi',
            ),
            'a.typedata',
            trx.raw('ISNULL(b.id, 0) AS cuti_id'),
            trx.raw("ISNULL(b.tglpengajuan, '1900-01-01') AS tglpengajuan"),
          )
          .from(`${tempKartucuti} AS a`)
          .leftJoin(`${tempCuti} AS b`, function () {
            this.on('a.tglbukti', '=', 'b.tglcuti')
              .andOn('a.typedata', '=', trx.raw('?', [3]))
              .andOn('a.karyawan_id', '=', 'b.karyawan_id');
          })
          .orderBy('a.karyawan_id')

          .orderBy(
            trx.raw(
              '(CASE WHEN ISNULL(b.id, 0) = 0 THEN a.tglbukti2 ELSE b.tglpengajuan END), a.typedata',
            ),
          ),
      );
    } else {
      await trx.schema.createTable(tempCekHangusCutiAkhir, (t) => {
        t.integer('karyawan_id');
        t.text('jenistransaksi');
        t.integer('id');
      });

      await trx(tempCekHangusCutiAkhir).insert(
        trx
          .select('karyawan_id', 'jenistransaksi', trx.raw('MAX(id) as id'))
          .from(`${tempListData} AS A`)
          .groupBy('karyawan_id', 'jenistransaksi'), // Add 'jenistransaksi' to the group by clause
      );

      await trx(tempListData)
        .join(`${tempCekHangusCutiAkhir} AS b`, function () {
          this.on(`${tempListData}.karyawan_id`, '=', 'b.karyawan_id').andOn(
            `${tempListData}.id`,
            '=',
            'b.id',
          );
        })
        .whereRaw('UPPER(??) = ?', [
          `${tempListData}.jenistransaksi`,
          'HANGUS CUTI',
        ]) // Use whereRaw to properly handle the UPPER function
        .del();
    }

    await trx(tempDataHasil).insert(
      trx
        .select(
          'a.karyawan_id',
          'a.periodedari',
          'a.periodesampai',
          'a.tglbukti',
          'a.jenistransaksi',
          'a.masuk',
          'a.keluar',
          'a.keluarprediksi',
          trx.raw(
            'SUM(a.masuk - a.keluar) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti2, (CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti2 ELSE a.tglpengajuan END),a.typedata ASC) AS saldo',
          ),
          trx.raw(
            'SUM(a.masuk - a.keluarprediksi) OVER (PARTITION BY a.karyawan_id ORDER BY a.karyawan_id,a.tglbukti2, (CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti2 ELSE a.tglpengajuan END),a.typedata ASC) AS saldoprediksi',
          ),
          'a.cuti_id',
          'a.typedata',
        )
        .from(`${tempListData} AS a`)
        .innerJoin(`${tempKaryawanId} AS C`, 'A.karyawan_id', 'C.karyawan_id')
        .orderBy('a.karyawan_id')
        .orderBy(
          trx.raw(
            '(CASE WHEN ISNULL(a.cuti_id, 0) = 0 THEN a.tglbukti2 ELSE a.tglpengajuan END),a.typedata',
          ),
        ),
    );

    // Insert into #tempjatahcuti
    await trx(tempJatahCuti).insert(
      trx
        .select(
          'A.karyawan_id',
          'A.tglbukti',
          'A.jenistransaksi',
          'A.masuk AS jatahcuti',
          'A.periodedari',
          'A.periodesampai',
        )
        .from(`${tempDataHasil} AS A`)
        .where('A.masuk', '<>', 0)
        .orderBy('A.tglbukti'),
    );

    // Insert into #tempsisacuti
    await trx(tempSisaCuti).insert(
      trx
        .select(
          'b.cuti_id',
          'a.karyawan_id',
          'a.tglbukti',
          'a.jenistransaksi',
          'a.keluar as cuti',
          'a.saldo as saldo',
          'a.saldoprediksi as saldoprediksi',
          'a.periodedari',
          'a.periodesampai',
          trx.raw('c.tglpengajuan'),
          trx.raw(
            "FORMAT(c.tglpengajuan, 'yyyyMMdd') + REPLICATE('0', 10 - LEN(TRIM(STR(c.id)))) + TRIM(STR(c.id)) as [key]",
          ),
        )
        .from(`${tempDataHasil} AS a`)
        .innerJoin('cuti AS c', 'a.karyawan_id', 'c.karyawan_id')
        .innerJoin('cutidetail AS b', function () {
          this.on('a.tglbukti', '=', 'b.tglcuti').andOn(
            'c.id',
            '=',
            'b.cuti_id',
          );
        })
        // .where('a.keluar', '<>', 0)
        .where(trx.raw("ISNULL(a.jenistransaksi, '') <> 'hangus cuti'"))
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutidari, '1900-01-01')) <> 1900"),
        )
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutisampai, '1900-01-01')) <> 1900"),
        )
        .orderBy('a.id'),
    );

    await trx(tempSisaCuti).insert(
      trx
        .select(
          'b.cuti_id',
          'a.karyawan_id',
          'a.tglbukti',
          'a.jenistransaksi',
          'a.keluar as cuti',
          'a.saldo as saldo',
          'a.saldoprediksi as saldoprediksi',
          'a.periodedari',
          'a.periodesampai',
          trx.raw('c.tglpengajuan'),
          trx.raw(
            "FORMAT(c.tglpengajuan, 'yyyyMMdd') + REPLICATE('0', 10 - LEN(TRIM(STR(c.id)))) + TRIM(STR(c.id)) as [key]",
          ),
        )
        .from(`${tempDataHasil} AS a`)
        .innerJoin('cuti AS c', 'a.karyawan_id', 'c.karyawan_id')
        .innerJoin('cutidetail AS b', function () {
          this.on('a.tglbukti', '=', 'b.tglcuti').andOn(
            'c.id',
            '=',
            'b.cuti_id',
          );
        })
        .where('a.typedata', '=', 4)
        .andWhere(trx.raw("ISNULL(a.jenistransaksi, '') <> 'hangus cuti'"))
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutidari, '1900-01-01')) <> 1900"),
        )
        .andWhere(
          trx.raw("YEAR(ISNULL(b.periodecutisampai, '1900-01-01')) <> 1900"),
        )
        .orderBy('a.id'),
    );

    // Insert into #Tempjatahcutihasil
    await trx(tempJatahCutiHasil).insert(
      trx
        .select(
          'A.key',
          'A.cuti_id',
          'A.karyawan_id',
          trx.raw('MAX(A.id) AS id'),
          'A.periodesampai',
          'A.periodesampai',
        )
        .from(`${tempSisaCuti} AS A`)
        .groupBy(
          'A.key',
          'A.cuti_id',
          'A.karyawan_id',
          'A.periodesampai',
          'A.periodesampai',
        ),
    );

    // Insert into #Tempjatahcutihasil2
    await trx(tempJatahCutiHasil2).insert(
      trx
        .select(
          trx.raw(
            'A.cuti_id, A.karyawan_id, ISNULL(C.jatahcuti, 0) AS jatahcuti, B.saldo AS sisacuti, B.saldoprediksi as prediksicuti',
          ),
          trx.raw(
            `ROW_NUMBER() OVER (PARTITION BY A.karyawan_id ORDER BY a.karyawan_id, A.cuti_id ASC) AS urut`,
          ),
          trx.raw('NULL as periodedari'),
          trx.raw('NULL as periodesampai'),
        )
        .from(`${tempJatahCutiHasil} AS A`)
        .innerJoin(`${tempSisaCuti} AS B`, 'A.id', 'B.id')
        .leftJoin(`${tempJatahCuti} AS C`, function () {
          this.on('A.karyawan_id', '=', 'C.karyawan_id')
            .andOn('C.periodedari', '=', 'B.periodedari')
            .andOn('C.periodesampai', '=', 'B.periodesampai');
        })
        .orderBy('A.karyawan_id')
        .orderBy('A.cuti_id'),
    );

    await trx(Tempterpakai).insert(
      trx
        .select(
          'karyawan_id',
          'periodedari',
          'periodesampai',
          trx.raw('MAX(id) as id2'),
        )
        .from(tempListData)
        .groupBy('karyawan_id', 'periodedari', 'periodesampai'),
    );

    if (iskartucuti == 1) {
      await trx.schema.createTable(Tempkartucutilaporan, (t) => {
        t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
        t.integer('karyawan_id');
        t.datetime('periodedari');
        t.datetime('periodesampai');
        t.text('jenistransaksi'); // varchar(100) pada SQL Server
        t.datetime('tglbukti');
        t.integer('masuk');
        t.integer('keluar');
        t.integer('saldo');
      });
      if (tahun != 0) {
        //
        await trx(Tempkartucutilaporan).insert(
          trx
            .select(
              'karyawan_id',
              'periodedari',
              'periodesampai',
              'jenistransaksi',
              'tglbukti',
              'masuk',
              'keluar',
              trx.raw('0'), // This will insert 0 for the last column (as per your original code)
            )
            .from(tempListData) // Ensure you're selecting from the correct table
            .where(trx.raw('YEAR(periodedari) = ?', [tahun])) // Ensure YEAR function works correctly with the datetime format
            .andWhere('jenistransaksi', '=', 'SALDO CUTI') // Ensure the condition for jenistransaksi is applied
            .orderBy('tglbukti'),
        );

        const oldCuti = await trx(tempListData)
          .where(trx.raw('YEAR(periodedari) = ?', [tahun])) // Ensure YEAR function works correctly with the datetime format
          .andWhere('jenistransaksi', '=', 'SALDO CUTI')
          .first();
        if (oldCuti) {
          const ptglbukti = await trx(tempListData)
            .select('tglbukti')
            .where(trx.raw(`YEAR(periodedari) = ?`, [tahun]))
            .andWhere('jenistransaksi', '=', 'SALDO CUTI')
            .first();

          await trx(Tempkartucutilaporan).insert(
            trx
              .select(
                'a.karyawan_id',
                'a.periodedari',
                'a.periodesampai',
                trx.raw(
                  `'CUTI TERPAKAI TAHUN ' + TRIM(STR(${tahun - 1})) as jenistransaksi`,
                ),
                trx.raw(
                  `CONVERT(DATETIME, ?, 120) as tglbukti`,
                  [new Date(ptglbukti.tglbukti).toISOString().slice(0, 10)], // Convert JavaScript date to 'yyyy-mm-dd' format
                ),
                trx.raw('0 as masuk'),
                trx.raw('ABS(ISNULL(qtysaldo, 0)) as keluar'),
                trx.raw('0'),
              )
              .from(`${tempListData} as a`)
              .innerJoin(`${Tempterpakai} as b`, function () {
                this.on('A.id', '=', 'B.id2')
                  .andOn('a.karyawan_id', '=', 'b.karyawan_id')
                  .andOn('a.periodedari', '=', 'b.periodedari')
                  .andOn('a.periodesampai', '=', 'b.periodesampai');
              })
              .where(trx.raw(`YEAR(a.periodedari) = ?`, [tahun - 1]))
              .andWhereRaw('(masuk - ISNULL(a.qtysaldo, 0)) <> 0')
              .orderBy('tglbukti'),
          );
        } else {
          await trx(Tempkartucutilaporan).insert(
            trx
              .select(
                'karyawan_id',
                'periodedari',
                'periodesampai',
                trx.raw(
                  `'CUTI TERPAKAI TAHUN ' + TRIM(STR(${tahun - 1})) as jenistransaksi`,
                ), // Corrected to MSSQL string concatenation
                'tglbukti',
                trx.raw('0 as masuk'),
                trx.raw('ABS(ISNULL(qtysaldo, 0)) as keluar'), // Corrected the SQL expression
                trx.raw('0'), // This will insert 0 for the last column (as per your original code)
              )
              .from(tempListData) // Ensure the table name is properly quoted
              .where(trx.raw(`YEAR(periodedari) = ?`, [tahun - 1])) // Used parameterized query
              // .andWhere('jenistransaksi', '=', 'SALDO CUTI') // Corrected the condition
              .andWhereRaw('(ISNULL(qtysaldo, 0)) < 0') // Corrected the condition for `keluar`
              .orderBy('id', 'desc')
              .first(),
          );
        }

        // console.log('Tempkartucutilaporan2', await trx(Tempkartucutilaporan));

        await trx(Tempkartucutilaporan).insert(
          trx
            .select(
              'karyawan_id',
              'periodedari',
              'periodesampai',
              trx.raw('UPPER(jenistransaksi) as jenistransaksi'),
              'tglbukti',
              'masuk',
              'keluar',
              trx.raw('0'), // This will insert 0 for the last column (as per your original code)
            )
            .from(tempListData)
            .where(trx.raw('YEAR(periodedari) = ?', [tahun]))
            .andWhereNot('jenistransaksi', 'SALDO CUTI')
            .orderBy('tglbukti'),
        );
        // console.log('Tempkartucutilaporan3', await trx(Tempkartucutilaporan));
      } else {
        await trx(Tempkartucutilaporan).insert(
          trx
            .select(
              'karyawan_id',
              'periodedari',
              'periodesampai',
              trx.raw('UPPER(jenistransaksi) as jenistransaksi'),
              'tglbukti',
              'masuk',
              'keluar',
              trx.raw('0'), // This will insert 0 for the last column (as per your original code)
            )
            .from(tempListData),
        );
      }

      await trx.schema.createTable(TempkartucutilaporanRekap, (t) => {
        t.increments('id').primary(); // IDENTITY(1,1) pada SQL Server secara otomatis dilakukan dengan `increments`
        t.integer('karyawan_id');
        t.datetime('periodedari');
        t.datetime('periodesampai');
        t.text('jenistransaksi'); // varchar(100) pada SQL Server
        t.datetime('tglbukti');
        t.integer('masuk');
        t.integer('keluar');
        t.integer('saldo');
      });
      await trx(TempkartucutilaporanRekap).insert(
        trx
          .select(
            'karyawan_id',
            'periodedari',
            'periodesampai',
            'jenistransaksi',
            'tglbukti',
            'masuk',
            'keluar',
            trx.raw(
              'SUM(masuk - keluar) OVER (PARTITION BY karyawan_id ORDER BY karyawan_id, tglbukti, id ASC) as saldo',
            ), // Corrected the window function syntax
          )
          .from(Tempkartucutilaporan)
          .orderBy('tglbukti', 'id'), // Corrected the orderBy syntax
      );

      // console.log('masuk3', await trx(TempkartucutilaporanRekap));
      const result = await trx(`${TempkartucutilaporanRekap} as A`)
        .select(
          'A.id',
          'A.karyawan_id',
          'B.namakaryawan',
          'A.periodedari',
          'A.periodesampai',
          'A.jenistransaksi',
          'A.tglbukti',
          'A.masuk',
          'A.keluar',
          'A.saldo',
        )
        .innerJoin('karyawan as B', 'A.karyawan_id', 'B.id')
        .orderBy('b.id')
        .orderBy('A.id');
      return result;
    } else {
      if (isproses == 0) {
        // return await trx(tempJatahCutiHasil2).orderBy('cuti_id', 'desc');
        return tempJatahCutiHasil2;
      } else {
        let atahun;
        if (tahun == 0) {
          atahun = new Date().getFullYear(); // Get the current year
        } else {
          atahun = tahun;
        }

        await trx(`${tempJatahCutiHasil2}`)
          .update({
            periodedari: trx.raw('b.periodecutidari'), // No need to use ?? here, as it's not required for columns
            periodesampai: trx.raw('b.periodecutisampai'),
          })
          .innerJoin(
            'cutidetail as b',
            `${tempJatahCutiHasil2}.cuti_id`,
            'b.cuti_id',
          );

        await trx(tempJatahCutiHasil2).insert(
          trx
            .select(
              trx.raw(
                '0 as cuti_id, A.karyawan_id, A.saldo AS jatahcuti, 0 AS sisacuti, 0 as prediksicuti, 1 as urut, NULL as periodedari, NULL as periodesampai',
              ), // Fixing by combining the SQL into a single raw string
            )
            .from('saldocuti AS A')
            .leftOuterJoin(`${tempJatahCutiHasil2} AS b`, function () {
              this.on('A.karyawan_id', '=', 'b.karyawan_id')
                .andOn('a.periodetgldari', '=', 'b.periodedari')
                .andOn('a.periodetglsampai', '=', 'B.periodesampai');
            })
            .innerJoin('karyawan AS c', 'A.karyawan_id', 'c.id')
            .innerJoin(`${tempKaryawanId} AS d`, 'c.id', 'd.karyawan_id')
            .where(trx.raw(`YEAR(a.periodetgldari) = ${atahun}`))
            .andWhereRaw('ISNULL(b.karyawan_id,0)=0')
            .andWhereRaw("YEAR(ISNULL(c.tglresign, '1900/1/1'))=1900"),
        );

        await trx(Tempdataurut).insert(
          trx
            .select('a.karyawan_id', trx.raw('MAX(a.urut) as urut'))
            .from(`${tempJatahCutiHasil2} as a`)
            .innerJoin('cuti AS b', function () {
              this.on('a.cuti_id', '=', 'b.id');
            })
            .innerJoin('cutidetail AS c', function () {
              this.on('a.cuti_id', '=', 'c.cuti_id');
            })
            .andWhere(trx.raw(`YEAR(c.periodecutidari) < ${atahun}`))
            .groupBy('a.karyawan_id'),
        );

        const tempjatahcutiperiode =
          '##tempjatahcutiperiode' + Math.random().toString(36).substring(2, 8);
        await trx.schema.createTable(tempjatahcutiperiode, (t) => {
          t.integer('karyawan_id');
          t.integer('jatahcuti');
        });
        await trx(tempjatahcutiperiode).insert(
          trx
            .select('a.karyawan_id', trx.raw('MAX(a.jatahcuti) as jatahcuti'))
            .from(`${tempJatahCutiHasil2} as a`)
            .innerJoin('cuti as b1', 'a.cuti_id', 'b1.id')
            .innerJoin('cutidetail as c', 'a.cuti_id', 'c.cuti_id')
            .whereRaw('YEAR(C.periodecutidari) = ?', [atahun])
            .groupBy('a.karyawan_id'),
        );
        const temphasildatarekap =
          '##temphasildatarekap' + Math.random().toString(36).substring(2, 8);
        await trx.schema.createTable(temphasildatarekap, (t) => {
          t.integer('karyawan_id');
          t.integer('jatahcuti');
          t.integer('terpakai');
        });
        await trx(temphasildatarekap).insert(
          trx
            .select(
              'a.karyawan_id',
              trx.raw('ISNULL(c.jatahcuti,ISNULL(a.jatahcuti,0)) as jatahcuti'),
              trx.raw(
                '(CASE WHEN a.sisacuti < 0 THEN ABS(a.sisacuti) ELSE 0 END) as terpakai',
              ),
            )
            .from(`${tempJatahCutiHasil2} as a`)
            .innerJoin(`${Tempdataurut} as b`, function () {
              this.on('A.karyawan_id', '=', 'B.karyawan_id').andOn(
                'A.urut',
                '=',
                'B.urut',
              );
            })
            .leftOuterJoin(
              `${tempjatahcutiperiode} as c`,
              'a.karyawan_id',
              'c.karyawan_id',
            ),
        );
        await trx(temphasildatarekap).insert(
          trx
            .select(
              'a.karyawan_id',
              trx.raw('ISNULL(a.jatahcuti,0) as jatahcuti'),
              trx.raw('0 as terpakai'),
            )
            .from(`${tempJatahCutiHasil2} as a`)
            .leftOuterJoin(
              `${temphasildatarekap} as b`,
              'a.karyawan_id',
              'b.karyawan_id',
            )
            .whereRaw('ISNULL(b.karyawan_id,0)=0'),
        );
        const result = await trx(temphasildatarekap)
          .select(
            'karyawan_id',
            trx.raw('MAX(jatahcuti) as jatahcuti'),
            trx.raw('MAX(terpakai) as terpakai'),
          )
          .groupBy('karyawan_id');
        return result;
        // const result = await trx(`${tempJatahCutiHasil2} as a`)
        //   .select(
        //     'a.karyawan_id',
        //     'a.jatahcuti',
        //     trx.raw(
        //       'CASE WHEN A.sisacuti < 0 THEN abs(a.sisacuti) else 0 END as terpakai',
        //     ),
        //   )
        //   .innerJoin(`${Tempdataurut} AS B`, function () {
        //     this.on('a.karyawan_id', '=', 'B.karyawan_id').andOn(
        //       'a.urut',
        //       '=',
        //       'B.urut',
        //     );
        //   });
        // return result;
      }
    }
  }
  async findAllCabang(
    { search, filters, pagination, sort, flag }: FindAllParams,
    id: any,
    trx: any,
  ) {
    try {
      let { page, limit } = pagination;
      page = page ?? 1;
      if (limit == null) {
        limit = 0;
      }

      // kalau limit=0 → ubah ke MAX_SAFE_INTEGER supaya query.limit(…) tetap memuat semua baris
      if (limit === 0) {
        limit = Number.MAX_SAFE_INTEGER;
      }

      const offset = limit > 0 ? (page - 1) * limit : 0;

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
          'k.shift_id',
          'k.thr_id',
          'k.daftaremail_id',
          'k.approval_id',
          'k.absen_id',
          'k.kodemarketing',
          'k.alasanberhenti',
          'k.statusaktif',
          'k.email',
          'k.namaibu',
          'k.namaayah',
          'k.foto',
          'k.pengalamankerja',
          'k.modifiedby',
          trx.raw("FORMAT(k.tgllahir, 'dd-MM-yyyy') as tgllahir"),
          trx.raw("FORMAT(k.tglmasukkerja, 'dd-MM-yyyy') as tglmasukkerja"),
          trx.raw("FORMAT(k.tglresign, 'dd-MM-yyyy') as tglresign"),
          trx.raw("FORMAT(k.tglmutasi, 'dd-MM-yyyy') as tglmutasi"),
          'k.kodekaryawan',
          'k.keterangan',
          trx.raw("FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at"),
          trx.raw("FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at"),

          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',

          'a.nama as approval_nama',
          'shift.nama as shift_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          trx.raw('COUNT(*) OVER() AS __total_items'),
          trx.raw("COALESCE(atasan.namakaryawan, 'Tidak ada') as atasan_nama"),

          'thr.text as thr_text',
          trx.raw("COALESCE(de.nama, 'Tidak ada email') as daftaremail_email"),
          trx.raw(`
            CASE
              WHEN k.tglmasukkerja IS NOT NULL
               AND k.tglmasukkerja <= GETDATE()
              THEN
                CONCAT(
                  -- 1) Tahun penuh
                  DATEDIFF(YEAR, k.tglmasukkerja, GETDATE())
                    - CASE
                        WHEN MONTH(GETDATE()) < MONTH(k.tglmasukkerja)
                          OR (MONTH(GETDATE()) = MONTH(k.tglmasukkerja)
                              AND DAY(GETDATE()) < DAY(k.tglmasukkerja))
                        THEN 1 ELSE 0
                      END,
                  ' tahun, ',
          
                  -- 2) Bulan sisanya
                  (
                    (MONTH(GETDATE()) - MONTH(k.tglmasukkerja)
                       - CASE WHEN DAY(GETDATE()) < DAY(k.tglmasukkerja) THEN 1 ELSE 0 END
                    ) + 12
                  ) % 12,
                  ' bulan, ',
          
                  -- 3) Hari sisanya
                  CASE
                    WHEN DAY(GETDATE()) >= DAY(k.tglmasukkerja)
                    THEN DAY(GETDATE()) - DAY(k.tglmasukkerja)
                    ELSE
                      DAY(GETDATE())
                      + DAY(EOMONTH(DATEADD(MONTH, -1, GETDATE())))
                      - DAY(k.tglmasukkerja)
                  END,
                  ' hari'
                )
              ELSE NULL
            END AS lamabekerja
          `),
        ])
        .leftJoin('parameter as p1', 'k.statusaktif', 'p1.id')
        .leftJoin('parameter as p2', 'k.statuskerja_id', 'p2.id')
        .leftJoin('parameter as p3', 'k.statuskaryawan_id', 'p3.id')
        .leftJoin('parameter as p4', 'k.jeniskelamin_id', 'p4.id')
        .leftJoin('parameter as p5', 'k.golongandarah_id', 'p5.id')
        .leftJoin('parameter as p6', 'k.agama_id', 'p6.id')
        .leftJoin('approvalheader as a', 'k.approval_id', 'a.id')
        .leftJoin('cabang as c', 'k.cabang_id', 'c.id')
        .leftJoin('shift as shift', 'k.shift_id', 'shift.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id')
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id')
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id');
      // Jika limit > 0, kita gunakan limit dan offset
      if (filters?.role_id == 'APPROVAL') {
        const dataKaryawan = await trx('karyawan')
          .select('id')
          .where('atasan_id', id);
        query.whereIn(
          'k.id',
          dataKaryawan.map((item) => item.id),
        );
      }
      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      switch (true) {
        case !!search:
          const sanitized = String(search).replace(/\[/g, '[[]').trim();
          query.where((qb) => {
            const searchFields = Object.keys(filters || {}).filter(
              (k) =>
                ![
                  'tglDari',
                  'tglSampai',
                  'created_at',
                  'updated_at',
                  'info',
                  'pengalamankerja',
                  'kodekaryawan',
                  'foto',
                  'keterangan',
                ].includes(k) && filters![k],
            );
            searchFields.forEach((field) => {
              qb.orWhere(`u.${field}`, 'like', `%${sanitized}%`);
            });
          });
          break;

        case !!filters:
          for (const [key, value] of Object.entries(filters)) {
            if (key === 'role_id') continue;
            if (value || value === ' ') {
              // Normalisasi spasi (mengganti beberapa spasi dengan satu spasi dan trim)
              const normalizedValue =
                typeof value === 'string'
                  ? value.replace(/\s+/g, ' ').trim()
                  : String(value);

              // Cek apakah nilai kosong atau hanya spasi
              if (normalizedValue === '') {
                // Jika nilai kosong, filter untuk NULL
                if (key === 'created_at' || key === 'updated_at') {
                  query.andWhereRaw(
                    "FORMAT(k.??, 'dd-MM-yyyy HH:mm:ss') IS NULL",
                    [key],
                  );
                } else if (
                  key === 'tgllahir' ||
                  key === 'tglmasukkerja' ||
                  key === 'tglmutasi' ||
                  key === 'tglresign'
                ) {
                  query.andWhereRaw('k.?? IS NULL', [key]);
                } else {
                  // Jika nilai kosong atau hanya spasi, maka data dianggap NULL
                  query.andWhereRaw('k.?? IS NULL', [key]);
                }
              } else {
                // Jika nilai tidak kosong, lakukan pencarian LIKE
                if (key === 'created_at' || key === 'updated_at') {
                  query.andWhereRaw(
                    "FORMAT(k.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?",
                    [key, `%${normalizedValue}%`],
                  );
                } else if (
                  key === 'tgllahir' ||
                  key === 'tglmasukkerja' ||
                  key === 'tglmutasi' ||
                  key === 'tglresign'
                ) {
                  query.andWhere(`k.${key}`, value);
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
                } else if (key === 'cabang_id') {
                  if (Array.isArray(value)) {
                    query.whereIn('k.cabang_id', value);
                  } else {
                    query.andWhere('k.cabang_id', value);
                  }
                  continue;
                } else {
                  query.andWhere(`k.${key}`, 'like', `%${value}%`);
                }
              }
            }
          }
          break;
      }

      if (sort?.sortBy && sort?.sortDirection) {
        switch (sort.sortBy) {
          case 'tglmasukkerja':
            query.orderBy('k.tglmasukkerja', sort.sortDirection);
            break;
          case 'tgllahir':
            query.orderBy('k.tgllahir', sort.sortDirection);
            break;
          case 'tglmutasi':
            query.orderBy('k.tglmutasi', sort.sortDirection);
            break;
          case 'tglresign':
            query.orderBy('k.tglresign', sort.sortDirection);
            break;
          case 'lamabekerja':
            // urut berdasarkan alias string "X tahun, Y bulan, Z hari"
            query.orderBy('k.tglmasukkerja', sort.sortDirection);
            break;

          default:
            query.orderBy(sort.sortBy, sort.sortDirection);
        }
      }
      console.log('flag', flag);

      if (flag == 'GET POSITION') {
        const data = await query;
        const total = data.length ? Number(data[0].__total_items) : 0;
        const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
        return {
          query: query.toQuery(),
          data,
          total,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalItems: total,
            itemsPerPage: limit > 0 ? limit : total,
          },
        };
      } else {
        console.log('Masuk kesini flag nya');
        const data = await query;
        const total = data.length ? Number(data[0].__total_items) : 0;
        const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
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
      }
    } catch (error) {
      console.log('error', error);
      console.error('Error fetching data:', error);
      throw new Error(error);
    }
  }
  async findProfileKaryawan(id: number, trx: any) {
    const dataRekapCuti = await this.rekapCuti(String(id), 1, trx);

    // Pastikan lastCuti tidak null atau undefined sebelum melanjutkan
    const lastCuti = await trx('cuti')
      .select('id')
      .where('karyawan_id', id)
      .orderBy('created_at', 'desc') // Urutkan berdasarkan tglcuti terakhir
      .first();

    if (!lastCuti) {
      return {
        totalCuti: 0,
        saldocuti: 0,
        tglterakhircuti: '-',
        totalIzin: 0,
        tglApprovalCuti: '-',
      };
    }

    const dataApproval = await trx('cutiapproval')
      .select('tglapproval', 'jenjangapproval')
      .where('cuti_id', lastCuti.id)
      .orderBy('jenjangapproval', 'desc') // Urutkan berdasarkan jenjangapproval, yang tertinggi di atas
      .first();

    const dataKaryawan = await this.findById(id, trx);

    let cutiQuery = trx('cuti as c')
      .select([
        trx.raw("FORMAT(c.tglpengajuan, 'dd-MM-yyyy') as tglpengajuan"),
        trx.raw('ISNULL(tc.jatahcuti, 0) AS jatahcuti'),
        trx.raw('ISNULL(tc.sisacuti, 0) AS sisacuti'),
        trx.raw('ISNULL(tc.prediksicuti, 0) AS prediksicuti'),
      ])
      .leftJoin(`${dataRekapCuti} as tc`, 'c.id', 'tc.cuti_id')
      .leftJoin('cutidetail as cd', 'c.id', 'cd.cuti_id')
      .where('c.karyawan_id', id)
      .orderBy('c.tglpengajuan', 'desc');
    const now = new Date();
    const currentYear = now.getFullYear(); // → 2025

    if (
      dataKaryawan.cabang_id == 28 ||
      dataKaryawan.cabang_id == 29 ||
      dataKaryawan.cabang_id == 1135
    ) {
      const masuk = new Date(dataKaryawan.tglmasukkerja);
      const startDate = new Date(masuk);
      startDate.setFullYear(currentYear - 1);
      const endDate = new Date(masuk);
      endDate.setFullYear(currentYear);

      cutiQuery = cutiQuery.andWhereBetween('cd.tglcuti', [startDate, endDate]);
    } else {
      const startOfYear = new Date(currentYear, 0, 1); // 01-01-2025
      const endOfYear = new Date(currentYear, 11, 31); // 31-12-2025

      cutiQuery = cutiQuery.andWhereBetween('cd.tglcuti', [
        startOfYear,
        endOfYear,
      ]);
    }

    const saldocuti = await trx(dataRekapCuti).orderBy('id', 'desc');
    const dataIzin = await trx('izin')
      .count('id as total')
      .where('karyawan_id', id)
      .andWhere('tglizin', '>=', new Date(currentYear, 0, 1)) // Mulai dari 1 Januari tahun ini
      .andWhere('tglizin', '<=', new Date(currentYear, 11, 31)) // Hingga 31 Desember tahun ini
      .first();
    const dataCuti = await cutiQuery.where('c.statuscuti', 151);

    const totalCuti = dataCuti.length;
    const saldocutikaryawan = saldocuti[0]?.prediksicuti;
    const tglterakhircuti = dataCuti[0]?.tglpengajuan;
    const totalIzin = dataIzin?.total ? Number(dataIzin.total) : 0;

    let tglApprovalCuti = '';
    if (dataApproval?.tglapproval !== null) {
      const lastCutiFormatted = new Date(dataApproval?.tglapproval);
      const day = String(lastCutiFormatted.getDate()).padStart(2, '0');
      const month = String(lastCutiFormatted.getMonth() + 1).padStart(2, '0');
      const year = lastCutiFormatted.getFullYear();
      tglApprovalCuti = `${day}-${month}-${year}`; // Format menjadi DD-MM-YYYY
    }

    return {
      totalCuti: dataCuti.length > 0 ? totalCuti : 0,
      saldocuti: saldocutikaryawan ? saldocutikaryawan : 0,
      tglterakhircuti: dataCuti.length > 0 ? tglterakhircuti : '-',
      totalIzin: dataIzin ? totalIzin : 0,
      tglApprovalCuti:
        dataCuti.length > 0 && dataApproval ? tglApprovalCuti : '-',
    };
  }

  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:H1');
    worksheet.mergeCells('A2:H2');
    worksheet.mergeCells('A3:H3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN KARYAWAN';
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
      worksheet.getCell(rowIndex + 6, 7).value = row.created_at;
      worksheet.getCell(rowIndex + 6, 8).value = row.updated_at;

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

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_karyawan_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }
  async exportToExcelHistoryCuti(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:G1');
    worksheet.mergeCells('A2:G2');
    worksheet.mergeCells('A3:G3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN HISTORI CUTI KARYAWAN';
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
      'NAMA KARYAWAN',
      'KETERANGAN',
      'TANGGAL TRANSAKSI',
      'MASUK',
      'KELUAR',
      'SALDO',
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
      worksheet.getCell(rowIndex + 6, 2).value = row.namakaryawan;
      worksheet.getCell(rowIndex + 6, 3).value = row.jenistransaksi;
      worksheet.getCell(rowIndex + 6, 4).value = row.tglbukti;
      worksheet.getCell(rowIndex + 6, 5).value = row.masuk;
      worksheet.getCell(rowIndex + 6, 6).value = row.keluar;
      worksheet.getCell(rowIndex + 6, 7).value = row.saldo;
      worksheet.getCell(rowIndex + 6, 4).numFmt = 'DD-MM-YYYY';
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
    worksheet.getColumn(2).width = 40;
    worksheet.getColumn(3).width = 40;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_histori_cuti_karyawan_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  async create(body: any, trx: any, id: any, role_id: any, cabang_id: any) {
    try {
      if (body.tglmutasi === '') {
        body.tglmutasi = null;
      } else if (body.tglmutasi) {
        body.tglmutasi = new Date(body.tglmutasi);
      }
      if (body.tglresign === '') {
        body.tglresign = null;
      } else if (body.tglresign) {
        body.tglresign = new Date(body.tglresign);
      }
      if (!body.tgllahir || body.tgllahir === '') {
        body.tgllahir = null;
      } else if (typeof body.tgllahir === 'string') {
        // Misal body.tgllahir = "25-06-2002"
        const [day, month, year] = body.tgllahir.split('-');
        // Hasil = "2002-06-25"
        body.tgllahir = `${year}-${month}-${day}`;
      }
      if (!body.tglmasukkerja || body.tglmasukkerja === '') {
        body.tglmasukkerja = null;
      } else if (typeof body.tglmasukkerja === 'string') {
        const [day, month, year] = body.tglmasukkerja.split('-');
        body.tglmasukkerja = `${year}-${month}-${day}`;
      }

      const currentTime = this.utilsService.getTime();
      body.updated_at = currentTime;
      body.created_at = currentTime;
      // Set password otomatis menjadi '123456' dan dienkripsi
      const passwordPlain = '12345678';
      const passwordHash = await bcrypt.hash(passwordPlain, 10); // Enkripsi password

      // Ambil hanya field yang diperlukan untuk insert
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        namacabang,
        cabang_nama,
        ...insertData
      } = body;

      Object.keys(insertData).forEach((key) => {
        const val = insertData[key];
        if (
          typeof val === 'string' &&
          !['tgllahir', 'tglmasukkerja', 'tglresign', 'tglmutasi'].includes(key)
        ) {
          insertData[key] = val.toUpperCase();
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
      rawFilters.cabang_id = cabang_id;
      rawFilters.role_id = role_id;
      const filterObj = rawFilters;
      const insertedItems = await trx('karyawan')
        .insert(insertData)
        .returning('*');

      const newItem = insertedItems[0];

      // Membuat user otomatis berdasarkan namaalias dan email karyawan
      const userInsertData = {
        username: newItem.namaalias, // Gunakan namaalias sebagai username
        name: newItem.namakaryawan, // Gunakan namakaryawan sebagai nama
        email: newItem.email, // Gunakan email karyawan sebagai email
        statusaktif: newItem.statusaktif,
        password: passwordHash, // Gunakan password yang sudah dienkripsi
        karyawan_id: newItem.id,
        modifiedby: newItem.modifiedby,
      };

      // Insert user ke tabel 'user'
      const createUser = await trx('users')
        .insert(userInsertData)
        .returning('*');
      await trx('userrole').insert({
        user_id: createUser[0].id,
        role_id: 3,
        modifiedby: insertData.modifiedby,
        created_at: dbMssql.fn.now(),
        updated_at: dbMssql.fn.now(),
      });
      const { abilities } = await this.utilsService.fetchUserRolesAndAbilities(
        createUser[0].id,
        trx,
      );

      // Update menu after roles and ACL updates
      const menuData = await this.utilsService.getDataMenuSidebar(trx);
      const menuString = this.utilsService.buildMenuString(menuData, abilities);
      await trx('users')
        .where('id', createUser[0].id)
        .update('menu', menuString);
      const temp = `##temp_${Math.random().toString(36).substring(2, 15)}`;

      await trx.schema.createTable(temp, (t) => {
        t.integer('id');
        t.string('npwp'); // Nomor Pokok Wajib Pajak
        t.string('namakaryawan'); // Nama Karyawan
        t.string('namaalias'); // Nama Alias
        t.integer('jeniskelamin_id'); // ID Jenis Kelamin (terhubung ke tabel parameter)
        t.string('alamat'); // Alamat
        t.string('tempatlahir'); // Tempat Lahir
        t.string('nohp'); // Nomor HP
        t.integer('agama_id'); // ID Agama (terhubung ke tabel parameter)
        t.integer('statuskerja_id'); // ID Status Kerja (terhubung ke tabel parameter)
        t.integer('statuskaryawan_id'); // ID Status Karyawan (terhubung ke tabel parameter)
        t.integer('jumlahtanggungan'); // Jumlah Tanggungan
        t.string('noktp'); // Nomor KTP
        t.integer('golongandarah_id'); // ID Golongan Darah (terhubung ke tabel parameter)
        t.integer('cabang_id'); // ID Cabang (terhubung ke tabel cabang)
        t.integer('jabatan_id'); // ID Jabatan (terhubung ke tabel jabatan)
        t.integer('atasan_id'); // ID Atasan (terhubung ke tabel karyawan)
        t.integer('shift_id'); // ID Shift (terhubung ke tabel shift)
        t.integer('thr_id'); // ID THR (terhubung ke tabel parameter)
        t.integer('daftaremail_id'); // ID Daftar Email (terhubung ke tabel daftaremail)
        t.integer('approval_id'); // ID Approval (terhubung ke tabel approvalheader)
        t.integer('absen_id'); // ID Absen (terhubung ke tabel logabsensi)
        t.string('kodemarketing'); // Kode Marketing
        t.string('alasanberhenti'); // Alasan Berhenti
        t.boolean('statusaktif'); // Status Aktif Karyawan
        t.string('email'); // Email Karyawan
        t.string('namaibu'); // Nama Ibu
        t.string('namaayah'); // Nama Ayah
        t.string('foto'); // Foto Karyawan
        t.string('pengalamankerja'); // Pengalaman Kerja
        t.string('modifiedby'); // Pengubah Data
        t.string('tgllahir'); // Tanggal Lahir
        t.string('tglmasukkerja'); // Tanggal Masuk Kerja
        t.string('tglresign'); // Tanggal Resign
        t.string('tglmutasi'); // Tanggal Mutasi
        t.string('kodekaryawan'); // Kode Karyawan
        t.text('keterangan'); // Keterangan
        t.string('created_at'); // Waktu Dibuat
        t.string('updated_at'); // Waktu Diperbarui

        // Fields hasil JOIN
        t.string('statusaktif_memo'); // Memo Status Aktif (dari tabel parameter)
        t.string('statusaktif_text'); // Text Status Aktif (dari tabel parameter)
        t.string('statuskerja_text'); // Text Status Kerja (dari tabel parameter)
        t.string('statuskaryawan_text'); // Text Status Karyawan (dari tabel parameter)
        t.string('jeniskelamin_text'); // Text Jenis Kelamin (dari tabel parameter)
        t.string('golongandarah_text'); // Text Golongan Darah (dari tabel parameter)
        t.string('agama_text'); // Text Agama (dari tabel parameter)

        t.string('approval_nama'); // Nama Approver (dari tabel approvalheader)
        t.string('shift_nama'); // Nama Shift (dari tabel shift)
        t.string('cabang_nama'); // Nama Cabang (dari tabel cabang)
        t.string('jabatan_nama'); // Nama Jabatan (dari tabel jabatan)

        t.integer('__total_items'); // Total items dalam hasil query
        t.string('atasan_nama'); // Nama Atasan (dari tabel karyawan, di-query menggunakan LEFT JOIN)

        t.string('thr_text'); // THR Text (dari tabel parameter)
        t.string('daftaremail_email'); // Email dari Daftar Email (dari tabel daftaremail)

        // Field untuk lamanya bekerja
        t.string('lamabekerja'); // Durasi kerja dalam tahun, bulan, hari (dihitung menggunakan DATEDIFF dan kondisi tanggal)
        t.increments('position');
      });

      const { data, pagination, query } = await this.findAllCabang(
        {
          search,
          filters: filterObj,
          pagination: { page, limit: 0 },
          sort: { sortBy, sortDirection },
          isLookUp: false, // Set based on your requirement (e.g., lookup flag)
          flag: 'GET POSITION',
        },
        id,
        trx,
      );
      console.log('data', data);
      await trx(temp).insert(trx.raw(query));
      // let itemIndex = allItems.findIndex((item) => Number(item.id) == Number(newItem.id));
      let itemIndex = await trx(temp)
        .select('position')
        .where('id', newItem.id)
        .first();
      itemIndex = itemIndex.position ? itemIndex.position - 1 : 0;
      if (insertData?.daftaremail_id) {
        const emailDetails = await trx('daftaremailtodetail')
          .select('toemail_id')
          .where('daftaremail_id', insertData.daftaremail_id);
        const emails = await trx('toemail')
          .select('email')
          .whereIn(
            'id',
            emailDetails.map((detail: any) => detail.toemail_id),
          );
        const dataKaryawan = await this.findById(newItem.id, trx);
        const ccEmailsData = await trx('daftaremailccdetail')
          .select('ccemail_id')
          .where('daftaremail_id', newItem.daftaremail_id);

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
        // Format tglinput with both date and time (e.g., "20 APR 2025 19:48:05")
        const date = new Date(insertData.created_at);

        // Bagian tanggal
        const day = date.toLocaleString('id-ID', { day: '2-digit' });
        const month = date
          .toLocaleString('id-ID', { month: 'short' })
          .toUpperCase();
        const year = date.getFullYear();

        // Bagian waktu, pakai padStart dan join dengan ':'
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const time = [hours, minutes, seconds].join(':');

        // Gabungkan
        const tglInputFormatted = `${day} ${month} ${year}, ${time}`;

        // Format tglmasukkerja to "01 APR 2025"
        const tglMasukKerjaFormatted = new Date(dataKaryawan.tglmasukkerja)
          .toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
          .toUpperCase(); // Ensures "APR" is in uppercase

        if (toemailArray > 0 && ccemailArray > 0) {
          await this.mailService.emailKaryawanBaru({
            email: toemailArray,
            ccemail: ccemailArray,
            namakaryawan: insertData.namakaryawan,
            alamat: insertData.alamat,
            gender: dataKaryawan.jeniskelamin_text,
            jabatan: dataKaryawan.jabatan_nama,
            foto: dataKaryawan.foto
              ? `https://hrapi.transporindo.com/uploads/${dataKaryawan.foto.toLowerCase()}`
              : '',
            cabang: dataKaryawan.cabang_nama,
            tglmasukkerja: tglMasukKerjaFormatted, // Formatted tglmasukkerja
            username: body.modifiedby,
            tglinput: tglInputFormatted, // Formatted tglinput with time
          });
        }
      }
      // Now use findAll to get the updated list with pagination, sorting, and filters

      const pageNumber = Math.floor(itemIndex / limit) + 1;

      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(data),
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD KARYAWAN',
          idtrans: newItem.id,
          nobuktitrans: newItem.id,
          aksi: 'ADD',
          datajson: JSON.stringify(newItem),
          modifiedby: newItem.modifiedby,
        },
        trx,
      );

      return {
        newItem,
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating data: ${error.message}`);
    }
  }

  async update(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();

      if (!existingData) {
        throw new Error('Data not found');
      }
      if (!data.tgllahir || data.tgllahir === '') {
        data.tgllahir = null;
      } else if (typeof data.tgllahir === 'string') {
        // Misal data.tgllahir = "25-06-2002"
        const [day, month, year] = data.tgllahir.split('-');
        // Hasil = "2002-06-25"
        data.tgllahir = `${year}-${month}-${day}`;
      }
      if (!data.tglmasukkerja || data.tglmasukkerja === '') {
        data.tglmasukkerja = null;
      } else if (typeof data.tglmasukkerja === 'string') {
        const [day, month, year] = data.tglmasukkerja.split('-');
        data.tglmasukkerja = `${year}-${month}-${day}`;
      }
      if (!data.tglmutasi || data.tglmutasi === '') {
        data.tglmutasi = null;
      } else if (typeof data.tglmutasi === 'string') {
        const [day, month, year] = data.tglmutasi.split('-');
        data.tglmutasi = `${year}-${month}-${day}`;
      }
      if (!data.tglresign || data.tglresign === '') {
        data.tglresign = null;
      } else if (typeof data.tglresign === 'string') {
        const [day, month, year] = data.tglresign.split('-');
        data.tglresign = `${year}-${month}-${day}`;
      }
      if (data.tglmutasi === '') {
        data.tglmutasi = null;
      } else if (data.tglmutasi) {
        data.tglmutasi = new Date(data.tglmutasi);
      }
      if (data.tglresign === '') {
        data.tglresign = null;
      } else if (data.tglresign) {
        data.tglresign = new Date(data.tglresign);
      }
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        statusaktif_memo,
        statusaktif_text,
        statuskerja_text,
        statuskaryawan_text,
        jeniskelamin_text,
        golongandarah_text,
        agama_text,
        approval_nama,
        cabang_nama,
        shift_nama,
        jabatan_nama,
        thr_text,
        atasan_nama,
        daftaremail_email,
        ...insertData
      } = data;
      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
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
      rawFilters.cabang_id = data.cabang_id;

      // 3. Gunakan filterObj di query nanti
      const filterObj = rawFilters;

      if (insertData.email) {
        await trx('users')
          .update({ email: insertData.email })
          .where('karyawan_id', id);
      }
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);

      if (hasChanges) {
        insertData.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', id).update(insertData);
      }

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
          'k.tglmutasi',
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
          trx.raw("FORMAT(k.tgllahir, 'dd-MM-yyyy') as tgllahir"),
          trx.raw("FORMAT(k.tglmasukkerja, 'dd-MM-yyyy') as tglmasukkerja"),
          trx.raw("FORMAT(k.tglresign, 'dd-MM-yyyy') as tglresign"),
          trx.raw("FORMAT(k.tglmutasi, 'dd-MM-yyyy') as tglmutasi"),
          'k.kodekaryawan',
          'k.keterangan',
          trx.raw("FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at"),
          trx.raw("FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at"),

          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',

          'a.nama as approval_nama',
          'shift.nama as shift_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          trx.raw("COALESCE(atasan.namakaryawan, 'Tidak ada') as atasan_nama"),

          'thr.text as thr_text',
          trx.raw("COALESCE(de.nama, 'Tidak ada email') as daftaremail_email"),
        ])
        .leftJoin('parameter as p1', 'k.statusaktif', 'p1.id')
        .leftJoin('parameter as p2', 'k.statuskerja_id', 'p2.id')
        .leftJoin('parameter as p3', 'k.statuskaryawan_id', 'p3.id')
        .leftJoin('parameter as p4', 'k.jeniskelamin_id', 'p4.id')
        .leftJoin('parameter as p5', 'k.golongandarah_id', 'p5.id')
        .leftJoin('parameter as p6', 'k.agama_id', 'p6.id')
        .leftJoin('approvalheader as a', 'k.approval_id', 'a.id')
        .leftJoin('cabang as c', 'k.cabang_id', 'c.id')
        .leftJoin('shift as shift', 'k.shift_id', 'shift.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id')
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id')
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id')

        .whereNull('k.tglresign')
        .orderBy(sortBy ? `k.${sortBy}` : 'k.id', sortDirection || 'desc');
      // .where('k.id', '<=', id);

      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(k.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else {
              query.andWhere(`k.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

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
            .orWhere('shift.nama', 'like', `%${search}%`)
            .orWhere('c.nama', 'like', `%${search}%`)
            .orWhere('j.nama', 'like', `%${search}%`)
            .orWhereRaw("FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              `%${search}%`,
            ])
            .orWhereRaw("FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              `%${search}%`,
            ]);
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
      if (insertData.statusaktif == 132) {
        const dataKaryawan = await this.findById(id, trx);
        const hasChanges = this.utilsService.hasChanges(
          insertData,
          existingData,
        );
        if (hasChanges) {
          insertData.updated_at = this.utilsService.getTime();
          await trx(this.tableName).where('id', id).update(insertData);
        }
        const karyawan = await trx(this.tableName)
          .select('daftaremail_id')
          .where('id', id)
          .first();

        const emailDetails = await trx('daftaremailtodetail')
          .select('toemail_id')
          .where('daftaremail_id', karyawan.daftaremail_id);

        // Mendapatkan email berdasarkan toemail_id
        const emails = await trx('toemail')
          .select('email', 'nama')
          .whereIn(
            'id',
            emailDetails.map((detail: any) => detail.toemail_id),
          );
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
        if (toemailArray.length > 0 || ccemailArray > 0) {
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
        }
      }
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT KARYAWAN',
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
  async updateProfileKaryawan(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();

      if (!existingData) {
        throw new Error('Data not found');
      }
      Object.keys(data).forEach((key) => {
        if (typeof data[key] === 'string') {
          data[key] = data[key].toUpperCase();
        }
      });
      // Only include fields from `data` that are present
      const updatedData = { ...existingData };
      // Update only the fields that are present in the data
      Object.keys(data).forEach((key) => {
        if (data[key] !== undefined) {
          updatedData[key] = data[key];
        }
      });

      const hasChanges = this.utilsService.hasChanges(data, existingData);

      if (hasChanges) {
        updatedData.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', id).update(data);
      }

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT KARYAWAN',
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
          ...updatedData, // return the updated data
        },
      };
    } catch (error) {
      console.error('Error updating profile:', error);
      throw new Error('Failed to update profile');
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

      const deleteUser = await trx('users').where('karyawan_id', id).del();
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'DELETE KARYAWAN',
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
          'k.tglmutasi',
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

          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',

          'a.nama as approval_nama',
          'c.nama as cabang_nama',
          'shift.nama as shift_nama',
          'j.nama as jabatan_nama',
          dbMssql.raw(
            "COALESCE(atasan.namakaryawan, 'Tidak ada') as atasan_nama",
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
        .leftJoin('shift as shift', 'k.shift_id', 'shift.id')
        .leftJoin('jabatan as j', 'k.jabatan_id', 'j.id')
        .leftJoin('karyawan as atasan', 'k.atasan_id', 'atasan.id')
        .leftJoin('parameter as thr', 'k.thr_id', 'thr.id')
        .leftJoin('daftaremail as de', 'k.daftaremail_id', 'de.id')
        .leftJoin('logabsensi as la', 'k.absen_id', 'la.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'k.id', 'temp.id')
        .whereNull('k.tglresign')

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
  async findById(id: number, trx: any) {
    try {
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
          trx.raw("FORMAT(k.tgllahir, 'dd-MM-yyyy') as tgllahir"),
          trx.raw("FORMAT(k.tglmasukkerja, 'dd-MM-yyyy') as tglmasukkerja"),
          trx.raw("FORMAT(k.tglresign, 'dd-MM-yyyy') as tglresign"),
          trx.raw("FORMAT(k.tglmutasi, 'dd-MM-yyyy') as tglmutasi"),
          'k.kodekaryawan',
          'k.keterangan',
          trx.raw("FORMAT(k.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at"),
          trx.raw("FORMAT(k.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at"),

          'p1.memo as statusaktif_memo',
          'p1.text as statusaktif_text',
          'p2.text as statuskerja_text',
          'p3.text as statuskaryawan_text',
          'p4.text as jeniskelamin_text',
          'p5.text as golongandarah_text',
          'p6.text as agama_text',

          'a.nama as approval_nama',
          'c.nama as cabang_nama',
          'j.nama as jabatan_nama',
          trx.raw("COALESCE(atasan.namakaryawan, 'Tidak ada') as atasan_nama"),
          'thr.text as thr_text',
          trx.raw("COALESCE(de.nama, 'Tidak ada email') as daftaremail_email"),
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

        // .where('k.tglresign', null)
        .where('k.id', id)

        .first();

      const data = await query;

      if (!data) {
        throw new NotFoundException('Data not found');
      }

      return data;
    } catch (error) {
      console.error('Error fetching data by id:', error);
      throw new Error('Failed to fetch data by id');
    }
  }
}
