import { Injectable } from '@nestjs/common';
import { CreateRekapKehadiranDto } from './dto/create-rekap-kehadiran.dto';
import { UpdateRekapKehadiranDto } from './dto/update-rekap-kehadiran.dto';
import * as fs from 'fs';
import * as path from 'path';
import { Workbook } from 'exceljs';
@Injectable()
export class RekapKehadiranService {
  async rekapKehadiran(
    pid: string,
    pidakhir: string,
    ptgl1: string,
    ptgl2: string,
    cabangId: number,
    search: string,
    sortBy: string,
    sortDirection: 'asc' | 'desc' = 'asc', // Default sort direction
    trx: any,
  ): Promise<any[]> {
    // Set date format to start weeks on Monday
    await trx.raw('SET DATEFIRST 1');

    // Convert string to Date format (assuming format dd-mm-yyyy)
    const convertToDate = (dateStr: string): Date => {
      const [day, month, year] = dateStr.split('-');
      return new Date(`${year}-${month}-${day}`);
    };

    const startDate = convertToDate(ptgl1);
    const endDate = convertToDate(ptgl2);
    const startDateStr = startDate.toISOString().slice(0, 10); // Format: yyyy-mm-dd
    const endDateStr = endDate.toISOString().slice(0, 10);
    // Create the temporary karyawan table
    const tempKaryawanTableName =
      '##temp_karyawan_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempKaryawanTableName, (t) => {
      t.integer('id');
      t.integer('absen_id');
      t.string('namakaryawan');
    });

    if (pid === '' && pidakhir !== '') {
      await trx(tempKaryawanTableName).insert(
        trx
          .select('a.id', 'a.absen_id', 'a.namakaryawan')
          .from('karyawan as a')
          .where('a.cabang_id', cabangId)
          .andWhereRaw('ISNULL(a.absen_id, 0) <> 0')
          .andWhereRaw("YEAR(ISNULL(a.tglresign, '1900-01-01')) = 1900")
          .andWhere('a.namakaryawan', '<=', pidakhir),
      );
    } else if (pid !== '' && pidakhir === '') {
      await trx(tempKaryawanTableName).insert(
        trx
          .select('a.id', 'a.absen_id', 'a.namakaryawan')
          .from('karyawan as a')
          .where('a.cabang_id', cabangId)
          .andWhereRaw('ISNULL(a.absen_id, 0) <> 0')
          .andWhereRaw("YEAR(ISNULL(a.tglresign, '1900-01-01')) = 1900")
          .andWhere('a.namakaryawan', '>=', pid),
      );
    } else if (pid !== '' && pidakhir !== '') {
      await trx(tempKaryawanTableName).insert(
        trx
          .select('a.id', 'a.absen_id', 'a.namakaryawan')
          .from('karyawan as a')
          .where('a.cabang_id', cabangId)
          .andWhereRaw('ISNULL(a.absen_id, 0) <> 0')
          .andWhereRaw("YEAR(ISNULL(a.tglresign, '1900-01-01')) = 1900")
          .andWhere('a.namakaryawan', '>=', pid)
          .andWhere('a.namakaryawan', '<=', pidakhir),
      );
    } else if (pid === '' && pidakhir === '') {
      await trx(tempKaryawanTableName).insert(
        trx
          .select('a.id', 'a.absen_id', 'a.namakaryawan')
          .from('karyawan as a')
          .where('a.cabang_id', cabangId)
          .andWhereRaw('ISNULL(a.absen_id, 0) <> 0')
          .andWhereRaw("YEAR(ISNULL(a.tglresign, '1900-01-01')) = 1900"),
      );
    }

    // Get employee data from branch (filtering by pid and pidakhir)
    const karyawanQuery = trx('karyawan')
      .select('absen_id', 'namakaryawan', 'shift_id')
      .where('cabang_id', cabangId)
      .whereRaw('ISNULL(absen_id, 0) <> 0')
      .andWhereRaw("YEAR(ISNULL(tglresign, '1900-01-01')) = 1900");
    if (pid && pidakhir) {
      karyawanQuery.whereBetween('namakaryawan', [pid, pidakhir]);
    } else if (pid && !pidakhir) {
      karyawanQuery.where('namakaryawan', '>=', pid);
    } else if (!pid && pidakhir) {
      karyawanQuery.where('namakaryawan', '<=', pidakhir);
    }

    if (search) {
      karyawanQuery.where('namakaryawan', 'like', `%${search}%`);
    }
    // Apply sorting if provided
    if (sortBy === 'namakaryawan') {
      karyawanQuery.orderBy(sortBy, sortDirection);
    }
    const karyawan = await karyawanQuery;

    // Fetch shift data for employees
    const shiftPerKaryawan = await trx('shift_detail')
      .select(
        'shift_id',
        'date_id as hari',
        'jammasuk',
        'jampulang',
        'batas_jammasuk',
      )
      .whereIn(
        'shift_id',
        karyawan.map((k) => k.shift_id),
      );

    // Create temporary shift table
    const tempShiftTableName =
      '##temp_shift_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempShiftTableName, (t) => {
      t.integer('absen_id');
      t.string('namakaryawan');
      t.integer('hari');
      t.time('jammasukmulai', 7);
      t.time('jammasuk', 7);
      t.time('jampulang', 7);
      t.time('batasjammasuk', 7);
    });
    const shiftData = karyawan.flatMap((k) =>
      shiftPerKaryawan
        .filter((s) => s.shift_id === k.shift_id)
        .map((s) => {
          const jammasukmulai = `${s.jammasuk}:59`; // Menambahkan detik :59 pada jammasukmulai
          const jammasuk = s.jammasuk; // Format jammasuk
          const jampulang = s.jampulang; // Format jampulang
          const batasjammasuk = s.batas_jammasuk; // Format batasjammasuk

          return {
            absen_id: k.absen_id,
            namakaryawan: k.namakaryawan,
            hari: s.hari,
            jammasukmulai: jammasukmulai, // Waktu dengan detik :59
            jammasuk: jammasuk, // Waktu dengan detik :00
            jampulang: jampulang, // Waktu dengan detik :00
            batasjammasuk: batasjammasuk, // Waktu dengan detik :00
          };
        }),
    );

    await trx(tempShiftTableName).insert(
      shiftData.map((shift) => ({
        absen_id: shift.absen_id,
        namakaryawan: shift.namakaryawan,
        hari: shift.hari,
        jammasukmulai: shift.jammasukmulai, // Waktu dalam format 'HH:MM:SS'
        jammasuk: shift.jammasuk, // Waktu dalam format 'HH:MM:SS'
        jampulang: shift.jampulang, // Waktu dalam format 'HH:MM:SS'
        batasjammasuk: shift.batasjammasuk, // Waktu dalam format 'HH:MM:SS'
      })),
    );

    // Create temporary attendance data table
    const tempDataHadir: { absen_id: any; tgl: string }[] = [];
    // Loop through each day in the date range
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10); // Get the date in YYYY-MM-DD format

      // Loop through each employee and add to the tempDataHadir array
      for (const k of karyawan) {
        tempDataHadir.push({ absen_id: k.absen_id, tgl: dateStr });
      }
    }

    // Create a unique table name for temporary table
    const tempDataHadirTableName =
      '##temp_data_hadir_' + Math.random().toString(36).substring(2, 8);

    // Create the temporary table in the database
    await trx.schema.createTable(tempDataHadirTableName, (t) => {
      t.integer('absen_id');
      t.date('tgl');
    });

    // Batch insert the tempDataHadir data into the created table
    await trx.batchInsert(tempDataHadirTableName, tempDataHadir);
    const logabsensipusatmasuk =
      '##logabsensipusatmasuk' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(logabsensipusatmasuk, (t) => {
      t.integer('absen_id');
      t.string('namakaryawan');
      t.datetime('tgljam');
      t.date('tgl');
      t.time('jam', 7);
    });
    await trx(logabsensipusatmasuk).insert(
      trx
        .select(
          'A.absen_id',
          trx.raw('MAX(UPPER(c.namakaryawan))'),
          trx.raw('MIN(CAST(A.tgljam AS DATETIME))'),
          trx.raw('CAST(A.tgl AS DATE) AS tgl'),
          trx.raw('MIN(A.jam) AS time'),
        )
        .from('logabsensi as A')
        .joinRaw(
          `INNER JOIN ${tempShiftTableName} AS b
           ON DATEPART(WEEKDAY, CAST(A.tgljam AS DATETIME)) = b.hari`,
        )
        .innerJoin(`${tempKaryawanTableName} AS c`, function () {
          this.on('A.absen_id', '=', 'c.absen_id');
        })
        .where('A.tgl', '>=', trx.raw('CAST(? AS DATE)', [startDateStr])) // Make sure startDateStr is in YYYY-MM-DD format
        .andWhere('A.tgl', '<=', trx.raw('CAST(? AS DATE)', [endDateStr])) // Ensure ptgl2 is in correct format
        .groupBy('A.absen_id', 'A.tgl')
        .orderByRaw('CAST(A.absen_id AS integer)')
        .orderBy('A.tgl'),
    );

    const logabsensipusatpulang =
      '##logabsensipusatpulang' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(logabsensipusatpulang, (t) => {
      t.integer('absen_id');
      t.string('namakaryawan');
      t.datetime('tgljam');
      t.date('tgl');
      t.time('jam', 7);
    });
    await trx(logabsensipusatpulang).insert(
      trx
        .select(
          'A.absen_id',
          trx.raw('MAX(UPPER(c.namakaryawan))'),
          trx.raw('MAX(CAST(A.tgljam AS DATETIME))'),
          trx.raw('CAST(A.tgl AS DATE) AS tgl'),
          trx.raw('MAX(A.jam) AS time'),
        )
        .from('logabsensi as A')
        .joinRaw(
          `INNER JOIN ${tempShiftTableName} AS b
          ON DATEPART(WEEKDAY, CAST(A.tgljam AS DATETIME)) = b.hari`,
        )
        .innerJoin(`${tempKaryawanTableName} AS c`, function () {
          this.on('A.absen_id', '=', 'c.absen_id');
        })
        .where('A.tgl', '>=', trx.raw('CAST(? AS DATE)', [startDateStr])) // Ensure startDateStr is in correct format
        .andWhere('A.tgl', '<=', trx.raw('CAST(? AS DATE)', [endDateStr])) // Ensure endDateStr is in correct format
        .andWhere(
          trx.raw('CAST(A.jam AS TIME) > CAST(b.batasjammasuk AS TIME)'),
        ) // Explicitly cast both A.jam and b.batasjammasuk to TIME
        .groupBy('A.absen_id', 'A.tgl')
        .orderByRaw('CAST(A.absen_id AS integer)')
        .orderBy('A.tgl'),
    );
    const tgl = '##tgl' + Math.random().toString(36).substring(2, 8);

    // Create the temporary table 'tgl'

    // Create the temporary table 'tgl'
    await trx.schema.createTable(tgl, (t) => {
      t.date('tgl');
      t.integer('absen_id');
    });

    const karyawandata = await trx(tempKaryawanTableName).select('absen_id');

    // Iterate through each employee using a for...of loop to handle async correctly
    for (const employee of karyawandata) {
      const xidabsen = employee.absen_id;

      const atgl1 = new Date(startDate); // Assuming atgl1 is a valid date object
      const atgl2 = new Date(endDate); // Adjust based on your logic for atgl2

      // Loop through each date between atgl1 and atgl2
      while (atgl1 <= atgl2) {
        await trx(tgl).insert({
          tgl: atgl1.toISOString().split('T')[0], // Formatting the date correctly for the DB
          absen_id: xidabsen,
        });

        // Increment the date by 1 day
        atgl1.setDate(atgl1.getDate() + 1); // Increment `atgl1`, not startDate
      }

      // if (xidabsen === 14) {
      //   await trx(tempShiftTableName).update(
      //     trx
      //       .select(
      //         trx.raw('? as absen_id', [xidabsen]),
      //         'namakaryawan',
      //         'hari',
      //         trx.raw(
      //           `CASE WHEN ? = 14 THEN '08:10:59' ELSE jammasukmulai END AS jammasukmulai`,
      //           [xidabsen],
      //         ),
      //         trx.raw(
      //           `CASE WHEN ? = 14 THEN '08:10' ELSE jammasuk END AS jammasuk`,
      //           [xidabsen],
      //         ),
      //         'jampulang',
      //         'batasjammasuk',
      //       )
      //       .from(tempShiftTableName),
      //   );
      // }
    }
    const tempCutiTableName =
      '##temp_cuti_' + Math.random().toString(36).substring(2, 8);

    // Create the temporary cuti table
    await trx.schema.createTable(tempCutiTableName, (t) => {
      t.integer('absen_id');
      t.date('tglcuti');
    });
    await trx(tempCutiTableName).insert(
      trx
        .select('a.absen_id', 'c.tglcuti')
        .from('karyawan as a')
        .innerJoin('cuti as b', 'a.id', 'b.karyawan_id')
        .innerJoin('cutidetail as c', 'b.id', 'c.cuti_id')
        .innerJoin(`${tempKaryawanTableName} AS d`, function () {
          this.on('A.id', '=', 'd.id');
        })
        .whereRaw('ISNULL(A.absen_id,0)<>0')
        .andWhere('a.cabang_id', cabangId)
        .andWhereRaw('ISNULL(b.statuscuti,0)=151')
        .andWhere('c.tglcuti', '>=', startDateStr)
        .andWhere('c.tglcuti', '<=', endDateStr),
    );

    const tempRekapTableName =
      '##temp_rekap_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempRekapTableName, (t) => {
      t.date('tgl');
      t.integer('absen_id');
      t.string('karyawan');
      t.time('jamshiftmasuk', 7);
      t.time('jamshiftpulang', 7);
      t.time('jammasuk', 7);
      t.time('jampulang', 7);
      t.specificType('selisihmasuk', 'money');
      t.specificType('selisihpulang', 'money');
    });
    await trx(tempRekapTableName).insert(
      trx
        .select(
          'A.tgl',
          'A.absen_id',
          'B.namakaryawan',
          trx.raw('LEFT(E.jammasuk, 5) AS jamshiftmasuk'),
          trx.raw('LEFT(E.jampulang, 5) AS jamshiftpulang'),
          trx.raw("COALESCE(CAST(c.jam AS VARCHAR), '00:00') AS jammasuk"),
          trx.raw("COALESCE(CAST(D.jam AS VARCHAR), '00:00') AS jampulang"),
          trx.raw(`
            CAST(LEFT(COALESCE(CAST(c.jam AS VARCHAR), '00:00:00'), 2) AS INTEGER) * 3600 +
            CAST(SUBSTRING(COALESCE(CAST(c.jam AS VARCHAR), '00:00:00'), 4, 2) AS INTEGER) * 60 +
            CAST(SUBSTRING(COALESCE(CAST(c.jam AS VARCHAR), '00:00:00'), 7, 2) AS INTEGER) -
            (CAST(LEFT(COALESCE(CAST(E.jammasukmulai AS VARCHAR), '00:00:00'), 2) AS INTEGER) * 3600 +
            CAST(SUBSTRING(COALESCE(CAST(E.jammasukmulai AS VARCHAR), '00:00:00'), 4, 2) AS INTEGER) * 60 +
            CAST(SUBSTRING(COALESCE(CAST(E.jammasukmulai AS VARCHAR), '00:00:00'), 7, 2) AS INTEGER))
            AS selisihmasuk`),
          trx.raw(`
            CAST(LEFT(COALESCE(CAST(D.jam AS VARCHAR), '00:00:00'), 2) AS INTEGER) * 3600 +
            CAST(SUBSTRING(COALESCE(CAST(D.jam AS VARCHAR), '00:00:00'), 4, 2) AS INTEGER) * 60 +
            CAST(SUBSTRING(COALESCE(CAST(D.jam AS VARCHAR), '00:00:00'), 7, 2) AS INTEGER) -
            (CAST(LEFT(COALESCE(CAST(E.jampulang AS VARCHAR), '00:00:00'), 2) AS INTEGER) * 3600 +
            CAST(SUBSTRING(COALESCE(CAST(E.jampulang AS VARCHAR), '00:00:00'), 4, 2) AS INTEGER) * 60 +
            CAST(SUBSTRING(COALESCE(CAST(E.jampulang AS VARCHAR), '00:00:00'), 7, 2) AS INTEGER))
            AS selisihpulang`),
        )
        .from(`${tempDataHadirTableName} AS A`)
        .innerJoin(`${tempKaryawanTableName} AS B`, function () {
          this.on('A.absen_id', '=', 'B.absen_id');
        })
        .leftOuterJoin(`${logabsensipusatmasuk} AS C`, function () {
          this.on('A.absen_id', '=', 'C.absen_id').andOn('A.tgl', '=', 'C.tgl');
        })
        .leftOuterJoin(`${logabsensipusatpulang} AS D`, function () {
          this.on('A.absen_id', '=', 'D.absen_id').andOn('A.tgl', '=', 'D.tgl');
        })
        .innerJoin(`${tempShiftTableName} AS E`, function () {
          this.on(trx.raw('DATEPART(dw, A.tgl)'), '=', 'E.hari').andOn(
            'A.absen_id',
            '=',
            'E.absen_id',
          );
        }),
    );

    const result = await trx
      .select(
        'H.namakaryawan as NamaKaryawan',
        trx.raw("FORMAT(A.tgl, 'dd-MM-yyyy') as Tanggal"),
        trx.raw(`
      CASE 
        WHEN DATEPART(dw, A.tgl) = 1 THEN 'Libur' 
        WHEN YEAR(ISNULL(E.tgl, '1900-01-01')) <> 1900 THEN 'Libur' 
        ELSE LEFT(CAST(D.jammasuk AS VARCHAR(12)), 5) + ' - ' + LEFT(CAST(D.jampulang AS VARCHAR(12)), 5) 
      END AS JadwalKerja
    `),
        trx.raw(`
      CASE 
        WHEN DATEPART(dw, A.tgl) = 1 THEN 'Libur' 
        WHEN YEAR(ISNULL(E.tgl, '1900-01-01')) <> 1900 THEN 'Libur' 
        WHEN YEAR(ISNULL(F.tglcuti, '1900-01-01')) <> 1900 THEN 'Cuti'
        WHEN YEAR(ISNULL(B.tgl, '1900-01-01')) <> 1900 OR YEAR(ISNULL(C.tgl, '1900-01-01')) <> 1900 THEN 'Hadir'
        ELSE 'Absen' 
      END AS Status
    `),
        trx.raw(`
      CASE 
        WHEN (CASE 
                WHEN DATEPART(dw, A.tgl) = 1 THEN 'Libur' 
                WHEN YEAR(ISNULL(E.tgl, '1900-01-01')) <> 1900 THEN 'Libur' 
                WHEN YEAR(ISNULL(F.tglcuti, '1900-01-01')) <> 1900 THEN 'Cuti'
                WHEN YEAR(ISNULL(B.tgl, '1900-01-01')) <> 1900 OR YEAR(ISNULL(C.tgl, '1900-01-01')) <> 1900 THEN 'Hadir'
                ELSE 'Absen' 
              END) IN ('Hadir') THEN 
          CASE 
            WHEN LEFT(CAST(ISNULL(B.jam, '00:00') AS VARCHAR(12)), 5) = '00:00' THEN 'Tidak Absen Masuk' 
            ELSE LEFT(CAST(ISNULL(B.jam, '00:00') AS VARCHAR(12)), 5) 
          END + ' - ' + 
          CASE 
            WHEN LEFT(CAST(ISNULL(C.jam, '00:00') AS VARCHAR(12)), 5) = '00:00' THEN 'Tidak Absen Pulang' 
            ELSE LEFT(CAST(ISNULL(C.jam, '00:00') AS VARCHAR(12)), 5) 
          END
        ELSE 
          CASE 
            WHEN DATEPART(dw, A.tgl) = 1 THEN 'Libur' 
            WHEN YEAR(ISNULL(E.tgl, '1900-01-01')) <> 1900 THEN 'Libur' 
            WHEN YEAR(ISNULL(F.tglcuti, '1900-01-01')) <> 1900 THEN 'Cuti'
            WHEN YEAR(ISNULL(B.tgl, '1900-01-01')) <> 1900 OR YEAR(ISNULL(C.tgl, '1900-01-01')) <> 1900 THEN 'Hadir'
            ELSE 'Absen' 
          END
      END AS JamKerja
    `),
        trx.raw(`
      CASE 
        WHEN LEFT(CAST(ISNULL(B.jam, '00:00') AS VARCHAR(12)), 5) = '00:00' THEN '-' 
        ELSE 
          CASE 
            WHEN G.selisihmasuk < 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihmasuk), ''), 108) 
            ELSE '-' 
          END 
      END AS CepatMasuk
    `),
        trx.raw(`
      CASE 
        WHEN LEFT(CAST(ISNULL(C.jam, '00:00') AS VARCHAR(12)), 5) = '00:00' THEN '-' 
        ELSE 
          CASE 
            WHEN G.selisihpulang < 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihpulang), ''), 108) 
            ELSE '-' 
          END 
      END AS CepatPulang
    `),
        trx.raw(`
      CASE 
        WHEN LEFT(CAST(ISNULL(B.jam, '00:00') AS VARCHAR(12)), 5) = '00:00' THEN '-' 
        ELSE 
          CASE 
            WHEN G.selisihmasuk > 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihmasuk), ''), 108) 
            ELSE '-' 
          END 
      END AS TerlambatMasuk
    `),
        trx.raw(`
      CASE 
        WHEN LEFT(CAST(ISNULL(C.jam, '00:00') AS VARCHAR(12)), 5) = '00:00' THEN '-' 
        ELSE 
          CASE 
            WHEN G.selisihpulang > 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihpulang), ''), 108) 
            ELSE '-' 
          END 
      END AS TerlambatPulang
    `),
      )
      .from(`${tgl} AS A`)
      .leftOuterJoin(`${logabsensipusatmasuk} AS B`, function () {
        this.on('A.tgl', '=', 'B.tgl').andOn('A.absen_id', '=', 'B.absen_id');
      })
      .leftOuterJoin(`${logabsensipusatpulang} AS C`, function () {
        this.on('A.tgl', '=', 'C.tgl').andOn('A.absen_id', '=', 'C.absen_id');
      })
      .leftOuterJoin(`${tempShiftTableName} AS D`, function () {
        this.on(trx.raw('DATEPART(dw, A.tgl)'), '=', 'D.hari').andOn(
          'A.absen_id',
          '=',
          'D.absen_id',
        );
      })
      .leftOuterJoin('harilibur AS E', function () {
        this.on('A.tgl', '=', 'E.tgl').andOn(
          'E.cabang_id',
          '=',
          trx.raw(cabangId),
        ); // Assuming `@pcabangid` is a parameter
      })
      .leftOuterJoin(`${tempCutiTableName} AS F`, function () {
        this.on('A.tgl', '=', 'F.tglcuti').andOn(
          'A.absen_id',
          '=',
          'F.absen_id',
        );
      })
      .leftOuterJoin(`${tempRekapTableName} AS G`, function () {
        this.on('A.tgl', '=', 'G.tgl').andOn('A.absen_id', '=', 'G.absen_id');
      })
      .innerJoin(
        `${tempKaryawanTableName} AS H`,
        'A.absen_id',
        '=',
        'H.absen_id',
      )
      .orderBy('H.namakaryawan', 'A.tgl');

    return result;
    // // Fetch log entries (Masuk) and log exits (Pulang)
    // // const logMasukQuery = await trx
    // //   .select('a.absen_id', 'a.tgl')
    // //   .from('logabsensi as a')
    // //   .whereBetween('logabsensi.tgl', [startDateStr, endDateStr])
    // //   .andWhereIn(
    // //     'logabsensi.absen_id',
    // //     karyawan.map((k) => k.absen_id),
    // //   )
    // //   .andWhere(
    // //     'logabsensi.jam',
    // //     '<=',
    // //     trx
    // //       .select('s.batasjammasuk')
    // //       .from(tempShiftTableName + ' as s')
    // //       .whereRaw('s.absen_id = logabsensi.absen_id')
    // //       .andWhereRaw('s.hari = DATEPART(WEEKDAY, logabsensi.tgl)')
    // //       .limit(1), // Menggunakan LIMIT untuk SELECT TOP 1
    // //   )
    // //   .groupBy('logabsensi.absen_id', 'logabsensi.tgl');

    // const logPulangQuery = trx.raw(
    //   `
    //     SELECT absen_id, tgl, MAX(jam) AS jampulang
    //     FROM logabsensi
    //     WHERE tgl BETWEEN ? AND ?
    //     AND absen_id IN (?)
    //     AND jam > (
    //         SELECT TOP 1 s.batasjammasuk
    //         FROM ${tempShiftTableName} AS s
    //         WHERE s.absen_id = logabsensi.absen_id
    //         AND s.hari = DATEPART(WEEKDAY, logabsensi.tgl)
    //     )
    //     GROUP BY absen_id, tgl
    // `,
    //   [startDateStr, endDateStr, karyawan.map((k) => k.absen_id)],
    // );
    // const tempCutiTableName =
    //   '##temp_cuti_' + Math.random().toString(36).substring(2, 8);

    // // Create the temporary cuti table
    // await trx.schema.createTable(tempCutiTableName, (t) => {
    //   t.integer('absen_id');
    //   t.date('tglcuti');
    // });
    // await trx.raw(
    //   `
    //   INSERT INTO ${tempCutiTableName} (absen_id, tglcuti)
    //   SELECT A.absen_id, C.tglcuti
    //   FROM karyawan A WITH (READUNCOMMITTED)
    //   INNER JOIN cuti B WITH (READUNCOMMITTED) ON A.id = B.karyawan_id
    //   INNER JOIN cutidetail C WITH (READUNCOMMITTED) ON B.id = C.cuti_id
    //   INNER JOIN cutiapproval D WITH (READUNCOMMITTED) ON B.id = D.cuti_id
    //   WHERE ISNULL(A.absen_id, 0) <> 0
    //     AND A.cabang_id = ?
    //     AND C.tglcuti BETWEEN ? AND ?
    // `,
    //   [cabangId, startDateStr, endDateStr],
    // );

    // // Create temporary table for holidays (Libur)
    // const tempHolidayTableName =
    //   '##temp_holiday_' + Math.random().toString(36).substring(2, 8);
    // await trx.schema.createTable(tempHolidayTableName, (t) => {
    //   t.date('tglharilibur');
    // });

    // // Insert holiday data (from tblharilibur)
    // await trx.raw(
    //   `
    //     INSERT INTO ${tempHolidayTableName} (tglharilibur)
    //     SELECT tgl
    //     FROM harilibur
    //     WHERE cabang_id = ?
    //     AND tgl BETWEEN ? AND ?
    // `,
    //   [cabangId, startDateStr, endDateStr],
    // );

    // // Temporary table to store rekap data
    // const tempRekapTableName =
    //   '##temp_rekap_' + Math.random().toString(36).substring(2, 8);
    // await trx.schema.createTable(tempRekapTableName, (t) => {
    //   t.date('tgl');
    //   t.integer('absen_id');
    //   t.string('karyawan');
    //   t.time('jamshiftmasuk');
    //   t.time('jamshiftpulang');
    //   t.time('jammasuk');
    //   t.time('jampulang');
    //   t.decimal('selisihmasuk');
    //   t.decimal('selisihpulang');
    //   t.time('jammasukmulai');
    // });

    // // Insert rekap data into the tempRekapTable
    // await trx.raw(`
    // INSERT INTO ${tempRekapTableName} (tgl, absen_id, karyawan, jamshiftmasuk, jamshiftpulang, jammasuk, jampulang, selisihmasuk, selisihpulang, jammasukmulai)
    // SELECT
    //     t.tgl,
    //     t.absen_id,
    //     k.namakaryawan,
    //     LEFT(s.jammasuk, 5) AS jamshiftmasuk,
    //     LEFT(s.jampulang, 5) AS jamshiftpulang,
    //     s.jammasuk,
    //     ISNULL(pulang.jampulang, '00:00') AS jampulang,
    //     DATEDIFF(SECOND, s.jammasukmulai, s.jammasuk) AS selisihmasuk,
    //     DATEDIFF(SECOND, s.jampulang, pulang.jampulang) AS selisihpulang,
    //     s.jammasukmulai
    // FROM ${tempDataHadirTableName} AS t
    // LEFT JOIN ${logabsensipusatmasuk} AS masuk ON t.absen_id = masuk.absen_id AND t.tgl = masuk.tgl
    // LEFT JOIN (${logPulangQuery}) AS pulang ON t.absen_id = pulang.absen_id AND t.tgl = pulang.tgl
    // LEFT JOIN ${tempShiftTableName} AS s ON t.absen_id = s.absen_id AND DATEPART(WEEKDAY, t.tgl) = s.hari
    // LEFT JOIN ${tempKaryawanTableName} AS k ON t.absen_id = k.absen_id
    // `);

    // // Fetch final rekap data, including holidays and with exact field names
    // const result = await trx(tempRekapTableName)
    //   .select(
    //     'H.karyawan as NamaKaryawan',
    //     trx.raw("FORMAT(A.tgl, 'dd-MM-yyyy') as Tanggal"),
    //     trx.raw(`
    //     CASE
    //       WHEN DATEPART(WEEKDAY, A.tgl) = 1 THEN 'Libur'
    //       WHEN EXISTS (SELECT 1 FROM ${tempHolidayTableName} WHERE tglharilibur = A.tgl) THEN 'Libur'
    //       ELSE LEFT(CAST(D.jammasuk AS VARCHAR(12)), 5) + ' - ' + LEFT(CAST(D.jammasuk AS VARCHAR(12)), 5)
    //     END as JadwalKerja
    //   `),
    //     trx.raw(`
    //     CASE
    //       WHEN DATEPART(WEEKDAY, A.tgl) = 1 THEN 'Libur'
    //       WHEN EXISTS (SELECT 1 FROM ${tempCutiTableName} WHERE tglcuti = A.tgl AND absen_id = A.absen_id) THEN 'Cuti'
    //       WHEN EXISTS (SELECT 1 FROM ${tempHolidayTableName} WHERE tglharilibur = A.tgl) THEN 'Libur'
    //       ELSE 'Hadir'
    //     END as Status
    //   `),
    //     trx.raw(`
    //     CASE
    //       WHEN DATEPART(WEEKDAY, A.tgl) = 1 THEN 'Libur'
    //       WHEN EXISTS (SELECT 1 FROM ${tempCutiTableName} WHERE tglcuti = A.tgl AND absen_id = A.absen_id) THEN 'Cuti'
    //       WHEN EXISTS (SELECT 1 FROM ${tempHolidayTableName} WHERE tglharilibur = A.tgl) THEN 'Libur'
    //       ELSE LEFT(CAST(D.jammasuk AS VARCHAR(12)), 5) + ' - ' + LEFT(CAST(D.jampulang AS VARCHAR(12)), 5)
    //     END as JamKerja
    //   `),
    //     trx.raw(`
    //     CASE
    //       WHEN LEFT(COALESCE(B.jammasuk, '00:00'), 5) = '00:00' THEN '-'
    //       ELSE
    //         CASE
    //           WHEN G.selisihmasuk < 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihmasuk), ''), 108)
    //           ELSE '-'
    //         END
    //     END AS CepatMasuk
    //   `),
    //     trx.raw(`
    //     CASE
    //       WHEN LEFT(COALESCE(C.jampulang, '00:00'), 5) = '00:00' THEN '-'
    //       ELSE
    //         CASE
    //           WHEN G.selisihpulang < 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihpulang), ''), 108)
    //           ELSE '-'
    //         END
    //     END AS CepatPulang
    //   `),
    //     trx.raw(`
    //     CASE
    //       WHEN LEFT(COALESCE(B.jammasuk, '00:00'), 5) = '00:00' THEN '-'
    //       ELSE
    //         CASE
    //           WHEN G.selisihmasuk > 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihmasuk), ''), 108)
    //           ELSE '-'
    //         END
    //     END AS TerlambatMasuk
    //   `),
    //     trx.raw(`
    //     CASE
    //       WHEN LEFT(COALESCE(C.jampulang, '00:00'), 5) = '00:00' THEN '-'
    //       ELSE
    //         CASE
    //           WHEN G.selisihpulang > 0 THEN CONVERT(CHAR(8), DATEADD(SECOND, ABS(G.selisihpulang), ''), 108)
    //           ELSE '-'
    //         END
    //     END AS TerlambatPulang
    //   `),
    //   )
    //   .from(`${temp} AS A`)
    //   .leftJoin(`${logabsensipusatmasuk} AS B`, 'A.tgl', 'B.tgl')
    //   .andOn('A.idabsen', 'B.idabsen')
    //   .leftJoin(`(${logPulangQuery}) AS C`, 'A.tgl', 'C.tgl')
    //   .andOn('A.idabsen', 'C.idabsen')
    //   .leftJoin(
    //     `${tempShiftTableName} AS D`,
    //     trx.raw('DATEPART(WEEKDAY, A.tgl)'),
    //     'D.hari',
    //   )
    //   .andOn('A.idabsen', 'D.idabsen')
    //   .leftJoin(`${tempHolidayTableName} AS E`, 'A.tgl', 'E.tgl')
    //   .andOn('E.cabang_id', trx.raw('@pcabangid'))
    //   .leftJoin(`${tempCutiTableName} AS F`, 'A.tgl', 'F.tglcuti')
    //   .andOn('A.idabsen', 'F.idabsen')
    //   .leftJoin(`${tempRekapTableName} AS G`, 'A.tgl', 'G.tgl')
    //   .andOn('A.idabsen', 'G.idabsen')
    //   .innerJoin(`${tempKaryawanTableName} AS H`, 'A.idabsen', 'H.idabsen')
    //   .orderBy('H.karyawan', 'A.tgl')
    //   .orderBy(
    //     sortBy === 'namakaryawan' ? 'NamaKaryawan' : 'tgl',
    //     sortDirection,
    //   );

    // return result;
  }
  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:J1');
    worksheet.mergeCells('A2:J2');
    worksheet.mergeCells('A3:J3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN REKAP KEHADIRAN';
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

    // Updated headers for the new fields
    const headers = [
      'No.',
      'Nama Karyawan',
      'Tanggal',
      'Jadwal Kerja',
      'Status',
      'Jam Kerja',
      'Cepat Masuk',
      'Cepat Pulang',
      'Terlambat Masuk',
      'Terlambat Pulang',
    ];

    // Apply headers to the sheet
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

    // Populate the data rows
    data.forEach((row, rowIndex) => {
      const currentRow = rowIndex + 6;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1; // Serial number
      worksheet.getCell(currentRow, 2).value = row.NamaKaryawan; // Nama Karyawan
      worksheet.getCell(currentRow, 3).value = row.Tanggal; // Tanggal
      worksheet.getCell(currentRow, 4).value = row.JadwalKerja; // Jadwal Kerja
      worksheet.getCell(currentRow, 5).value = row.Status; // Status
      worksheet.getCell(currentRow, 6).value = row.JamKerja; // Jam Kerja
      worksheet.getCell(currentRow, 7).value = row.CepatMasuk; // Cepat Masuk
      worksheet.getCell(currentRow, 8).value = row.CepatPulang; // Cepat Pulang
      worksheet.getCell(currentRow, 9).value = row.TerlambatMasuk; // Terlambat Masuk
      worksheet.getCell(currentRow, 10).value = row.TerlambatPulang; // Terlambat Pulang

      // Apply styling to all columns in the row
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

    // Set the column widths (adjust if necessary)
    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 20;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 20;
    worksheet.getColumn(10).width = 20;

    // Define temporary directory and file path
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_rekapkehadiran_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  create(createRekapKehadiranDto: CreateRekapKehadiranDto) {
    return 'This action adds a new rekapKehadiran';
  }

  findAll() {
    return `This action returns all rekapKehadiran`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rekapKehadiran`;
  }

  update(id: number, updateRekapKehadiranDto: UpdateRekapKehadiranDto) {
    return `This action updates a #${id} rekapKehadiran`;
  }

  remove(id: number) {
    return `This action removes a #${id} rekapKehadiran`;
  }
}
