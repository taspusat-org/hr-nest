import { Injectable } from '@nestjs/common';
import { CreateRekapketerlambatanDto } from './dto/create-rekapketerlambatan.dto';
import { UpdateRekapketerlambatanDto } from './dto/update-rekapketerlambatan.dto';
import * as fs from 'fs';
import * as path from 'path';
import { Workbook } from 'exceljs';
@Injectable()
export class RekapketerlambatanService {
  create(createRekapketerlambatanDto: CreateRekapketerlambatanDto) {
    return 'This action adds a new rekapketerlambatan';
  }
  async rekapKeterlambatan(
    ptgl1: string,
    ptgl2: string,
    cabangId: number,
    idabsenFrom: string,
    idabsenTo: string,
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

    // Get employee data from branch
    const karyawanQuery = trx('karyawan')
      .select('absen_id', 'namakaryawan', 'shift_id')
      .where('cabang_id', cabangId)
      .whereRaw('ISNULL(absen_id, 0) <> 0')
      .andWhereRaw("YEAR(ISNULL(tglresign, '1900-01-01')) = 1900");
    if (idabsenFrom && idabsenTo) {
      karyawanQuery.whereBetween('namakaryawan', [idabsenFrom, idabsenTo]);
    } else if (idabsenFrom && !idabsenTo) {
      karyawanQuery.where('namakaryawan', '>=', idabsenFrom);
    } else if (!idabsenFrom && idabsenTo) {
      karyawanQuery.where('namakaryawan', '<=', idabsenTo);
    }

    if (search) {
      karyawanQuery.where('namakaryawan', 'like', `%${search}%`);
    }

    // Apply sorting if provided
    if (sortBy === 'namakaryawan') {
      karyawanQuery.orderBy(sortBy, sortDirection);
    }
    const karyawan = await karyawanQuery;
    console.log(karyawan);
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

    // Map shift data for each employee
    const shiftData = karyawan.flatMap((k) =>
      shiftPerKaryawan
        .filter((s) => s.shift_id === k.shift_id)
        .map((s) => ({
          absen_id: k.absen_id,
          namakaryawan: k.namakaryawan,
          hari: s.hari,
          jammasukmulai: '08:30:59',
          jammasuk: s.jammasuk,
          jampulang: s.jampulang,
          batasjammasuk: s.batas_jammasuk,
        })),
    );

    // Temporary tables for shift and attendance data
    const tempShiftTableName =
      '##temp_shift_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempShiftTableName, (t) => {
      t.integer('absen_id');
      t.string('namakaryawan');
      t.integer('hari');
      t.time('jammasukmulai');
      t.time('jammasuk');
      t.time('jampulang');
      t.time('batasjammasuk');
    });
    await trx.batchInsert(tempShiftTableName, shiftData);

    const tempDataHadir: { absen_id: number; tgl: string }[] = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10);
      if (d.getDay() !== 0) {
        // Skip Sundays
        for (const k of karyawan) {
          tempDataHadir.push({ absen_id: k.absen_id, tgl: dateStr });
        }
      }
    }

    const tempDataHadirTableName =
      '##temp_data_hadir_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempDataHadirTableName, (t) => {
      t.integer('absen_id');
      t.date('tgl');
    });
    await trx.batchInsert(tempDataHadirTableName, tempDataHadir);

    // Query for log absensi (pulang dan masuk)
    const logMasukQuery = trx.raw(
      `
        SELECT absen_id, tgl, MIN(jam) AS jammasuk
        FROM logabsensi
        WHERE tgl BETWEEN ? AND ?
        AND absen_id IN (?)
        AND jam <= (
            SELECT TOP 1 s.batasjammasuk
            FROM ${tempShiftTableName} AS s
            WHERE s.absen_id = logabsensi.absen_id
            AND s.hari = DATEPART(WEEKDAY, logabsensi.tgl)
        )
        GROUP BY absen_id, tgl
    `,
      [startDateStr, endDateStr, karyawan.map((k) => k.absen_id)],
    );

    const logPulangQuery = trx.raw(
      `
        SELECT absen_id, tgl, MAX(jam) AS jampulang
        FROM logabsensi
        WHERE tgl BETWEEN ? AND ?
        AND absen_id IN (?)
        AND jam > (
            SELECT TOP 1 s.batasjammasuk
            FROM ${tempShiftTableName} AS s
            WHERE s.absen_id = logabsensi.absen_id
            AND s.hari = DATEPART(WEEKDAY, logabsensi.tgl)
        )
        GROUP BY absen_id, tgl
    `,
      [startDateStr, endDateStr, karyawan.map((k) => k.absen_id)],
    );

    // Temporary rekap table for final data
    const tempRekapTableName =
      '##temp_rekap_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempRekapTableName, (t) => {
      t.date('tgl');
      t.integer('absen_id');
      t.string('karyawan');
      t.time('jamshiftmasuk');
      t.time('jamshiftpulang');
      t.time('jammasuk');
      t.time('jampulang');
      t.decimal('selisih');
      t.time('jammasukmulai');
    });

    await trx.raw(`
      INSERT INTO ${tempRekapTableName} (tgl, absen_id, karyawan, jamshiftmasuk, jamshiftpulang, jammasuk, jampulang, selisih, jammasukmulai)
      SELECT 
        t.tgl,
        t.absen_id,
        s.namakaryawan,
        LEFT(s.jammasuk, 5) AS jammasuk,
        LEFT(s.jampulang, 5) AS jampulang,
        masuk.jammasuk,
        ISNULL(pulang.jampulang, '00:00') AS jampulang,
        DATEDIFF(SECOND, s.jammasukmulai, masuk.jammasuk) AS selisih,
        s.jammasukmulai
      FROM ${tempDataHadirTableName} AS t
      LEFT JOIN (${logMasukQuery}) AS masuk ON t.absen_id = masuk.absen_id AND t.tgl = masuk.tgl
      LEFT JOIN (${logPulangQuery}) AS pulang ON t.absen_id = pulang.absen_id AND t.tgl = pulang.tgl
      LEFT JOIN ${tempShiftTableName} AS s ON t.absen_id = s.absen_id AND DATEPART(WEEKDAY, t.tgl) = s.hari
      WHERE (DATEDIFF(SECOND, s.jammasukmulai, masuk.jammasuk) > 0 OR ISNULL(masuk.jammasuk, '00:00') = '00:00')
        AND (ISNULL(masuk.jammasuk, '00:00') != '00:00' OR ISNULL(pulang.jampulang, '00:00') != '00:00') -- Ensure that not both are '00:00'
    `);

    const result = await trx(tempRekapTableName)
      .select(
        trx.raw("FORMAT(tgl, 'dd-MM-yyyy') as TglAbsen"),
        'absen_id as IdAbsen',
        'karyawan as NamaKaryawan',
        trx.raw('LEFT(jamshiftmasuk, 5) as JamShiftMasuk'),
        trx.raw(
          `
        CASE 
          WHEN ISNULL(jammasuk, ?) = ? THEN 'Tidak Absen Masuk'
          ELSE LEFT(jammasuk, 8)
        END as JamMasuk
      `,
          ['00:00', '00:00'],
        ),
        trx.raw(
          `
          CASE 
            WHEN ISNULL(jamshiftmasuk, ?) = ? OR ISNULL(jamshiftpulang, ?) = ? THEN 'Tidak Absen Masuk'
            ELSE LEFT(jamshiftmasuk, 5) + ' - ' + LEFT(jamshiftpulang, 5)
          END AS JadwalKerja
        `,
          ['00:00', '00:00', '00:00', '00:00'],
        ),

        trx.raw(`
        CASE 
          WHEN jammasukmulai IS NULL OR jammasuk IS NULL THEN '00:00:00'
          ELSE CONVERT(char(8), DATEADD(SECOND, selisih, 0), 108)
        END as Terlambat
      `),
        trx.raw(
          `
        CASE 
          WHEN ISNULL(jammasuk, ?) != ? AND ISNULL(jampulang, ?) = ? THEN LEFT(jammasuk, 8) + ' - Tidak Absen Pulang'
          WHEN ISNULL(jammasuk, ?) = ? AND ISNULL(jampulang, ?) != ? THEN 'Tidak Absen Masuk - ' + LEFT(jampulang, 8)
          ELSE LEFT(jammasuk, 8) + ' - ' + LEFT(jampulang, 8)
        END as JamKerja
      `,
          [
            '00:00',
            '00:00',
            '00:00',
            '00:00',
            '00:00',
            '00:00',
            '00:00',
            '00:00',
          ],
        ),
      )
      .where(function () {
        this.whereRaw('(selisih > 0 OR ISNULL(jammasuk, ?) = ?)', [
          '00:00',
          '00:00',
        ]);
      })
      .orderBy(
        sortBy == 'namakaryawan' ? 'NamaKaryawan' : 'tgl',
        sortDirection,
      );

    return result;
  }
  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:G1');
    worksheet.mergeCells('A2:G2');
    worksheet.mergeCells('A3:G3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN REKAP KETERLAMBATAN';
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
      'Tanggal Absen',
      'Nama Karyawan',
      'Jadwal Kerja',
      'Jam Masuk',
      'Terlambat',
      'Jam Kerja',
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
      worksheet.getCell(currentRow, 2).value = row.TglAbsen; // Tanggal Absen
      worksheet.getCell(currentRow, 3).value = row.NamaKaryawan; // Nama Karyawan
      worksheet.getCell(currentRow, 4).value = row.JadwalKerja; // Jadwal Kerja
      worksheet.getCell(currentRow, 5).value = row.JamMasuk; // Jam Masuk
      worksheet.getCell(currentRow, 6).value = row.Terlambat; // Terlambat (Menit)
      worksheet.getCell(currentRow, 7).value = row.JamKerja; // Jam Kerja (Jam)

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
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 25;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 30;

    // Define temporary directory and file path
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_rekapketerlambatan_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  findAll() {
    return `This action returns all rekapketerlambatan`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rekapketerlambatan`;
  }

  update(id: number, updateRekapketerlambatanDto: UpdateRekapketerlambatanDto) {
    return `This action updates a #${id} rekapketerlambatan`;
  }

  remove(id: number) {
    return `This action removes a #${id} rekapketerlambatan`;
  }
}
