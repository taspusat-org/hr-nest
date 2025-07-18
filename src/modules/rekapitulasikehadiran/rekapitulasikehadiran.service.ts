import { Inject, Injectable } from '@nestjs/common';
import { CreateRekapitulasikehadiranDto } from './dto/create-rekapitulasikehadiran.dto';
import { UpdateRekapitulasikehadiranDto } from './dto/update-rekapitulasikehadiran.dto';
import { Knex } from 'knex';
import * as fs from 'fs';
import * as path from 'path';
import { Workbook } from 'exceljs';
interface LaporanRow {
  absen_id: number;
  namakaryawan: string;
  tgl: string;
  status: 'H' | 'T' | 'A' | 'L';
  jam: string | null;
}

@Injectable()
export class RekapitulasikehadiranService {
  constructor(@Inject('KNEX_CONNECTION') private readonly knex: Knex) {}

  async rekapitulasiKehadiran(
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
    await trx.raw('SET DATEFIRST 1');

    // Fungsi untuk mengonversi tanggal dari string dd-mm-yyyy ke Date
    const convertToDate = (dateStr: string): Date => {
      const [day, month, year] = dateStr.split('-');
      return new Date(`${year}-${month}-${day}`);
    };

    // Konversi tanggal dari string ke Date
    const startDate = convertToDate(ptgl1);
    const endDate = convertToDate(ptgl2);

    // Membuat nama tabel sementara dengan random string
    const tanggalTemp =
      '##temp_tanggal_' + Math.random().toString(36).substring(2, 8);
    const shiftTemp =
      '##temp_shift_' + Math.random().toString(36).substring(2, 8);
    const shiftKaryawanTemp =
      '##temp_shift_karyawan_' + Math.random().toString(36).substring(2, 8);
    const tempDataHadir =
      '##temp_data_hadir_' + Math.random().toString(36).substring(2, 8);
    const tempHasilLaporan =
      '##temp_hasil_laporan_' + Math.random().toString(36).substring(2, 8);
    const tempHasil =
      '##temp_hasil_' + Math.random().toString(36).substring(2, 8);
    const tempCuti =
      '##temp_cuti_' + Math.random().toString(36).substring(2, 8); // Tabel sementara untuk cuti
    await trx.schema.createTable(shiftTemp, (t) => {
      t.integer('absen_id');
      t.integer('hari');
      t.time('jammasuk');
      t.time('jampulang');
      t.time('batasjammasuk');
    });
    const karyawanQuery = trx('karyawan')
      .select('absen_id', 'namakaryawan', 'shift_id')
      .where('cabang_id', cabangId)
      .whereRaw('ISNULL(absen_id, 0) <> 0')
      .andWhereRaw("YEAR(ISNULL(tglresign, '1900-01-01')) = 1900");

    // Jika idabsenFrom dan idabsenTo ada, lakukan filter berdasarkan rentang absen_id

    if (idabsenFrom && idabsenTo) {
      karyawanQuery.whereBetween('namakaryawan', [idabsenFrom, idabsenTo]);
    } else if (idabsenFrom && !idabsenTo) {
      karyawanQuery.where('namakaryawan', '>=', idabsenFrom);
    } else if (!idabsenFrom && idabsenTo) {
      karyawanQuery.where('namakaryawan', '<=', idabsenTo);
    }

    // Jika ada parameter search, filter karyawan berdasarkan nama
    if (search) {
      karyawanQuery.where('namakaryawan', 'like', `%${search}%`);
    }

    // Ambil data karyawan sesuai dengan kondisi
    const karyawan = await karyawanQuery;
    const shiftDetail = await trx('shift_detail').select(
      'shift_id',
      'date_id as hari',
      'jammasuk',
      'jampulang',
      'batas_jammasuk',
    );

    const shiftPerKaryawan = karyawan.flatMap((k) =>
      shiftDetail
        .filter((s) => s.shift_id === k.shift_id)
        .map((s) => ({
          absen_id: k.absen_id,
          hari: s.hari,
          jammasuk: s.jammasuk,
          jampulang: s.jampulang,
          batasjammasuk: s.batas_jammasuk,
        })),
    );

    // Membuat tabel sementara untuk shift per karyawan

    await trx.batchInsert(shiftTemp, shiftPerKaryawan);
    // Menyaring data karyawan yang valid berdasarkan rentang absen_id
    await trx.schema.createTable(shiftKaryawanTemp, (t) => {
      t.integer('absen_id');
      t.string('namakaryawan');
    });
    await trx(shiftKaryawanTemp).insert(
      trx
        .select('absen_id', 'namakaryawan')
        .from('karyawan')
        .where('cabang_id', cabangId)
        .whereRaw('ISNULL(absen_id, 0) <> 0')
        .whereRaw("YEAR(ISNULL(tglresign, '1900-01-01')) = 1900"),
    );
    const tanggalRange: { absen_id: number; tgl: string }[] = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10);
      for (const k of karyawan) {
        tanggalRange.push({ absen_id: k.absen_id, tgl: dateStr });
      }
    }

    await trx.schema.createTable(tanggalTemp, (t) => {
      t.integer('absen_id');
      t.date('tgl');
    });
    await trx.batchInsert(tanggalTemp, tanggalRange, 500);
    const tempLogMasuk =
      '##tempLogMasuk_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempLogMasuk, (t) => {
      t.integer('absen_id');
      t.date('tgl');
      t.time('jammasuk');
    });
    const tempLogPulang =
      '##tempLogPulang_' + Math.random().toString(36).substring(2, 8);
    await trx.schema.createTable(tempLogPulang, (t) => {
      t.integer('absen_id');
      t.date('tgl');
      t.time('jam_pulang');
    });
    // Ambil data log masuk dan pulang
    await trx(tempLogMasuk).insert(
      trx('logabsensi as a')
        .select('a.absen_id', 'a.tgl')
        .min('a.jam as jam')
        .groupBy('a.absen_id', 'a.tgl')
        .innerJoin(`${shiftKaryawanTemp} as c`, 'a.absen_id', 'c.absen_id'),
    );
    await trx(tempLogPulang).insert(
      trx('logabsensi as a')
        .select('a.absen_id', 'a.tgl')
        .min('a.jam as jam')
        .groupBy('a.absen_id', 'a.tgl')
        .innerJoin(`${shiftKaryawanTemp} as c`, 'a.absen_id', 'c.absen_id'),
    );
    // Membuat tabel sementara untuk cuti
    await trx.schema.createTable(tempCuti, (t) => {
      t.integer('absen_id');
      t.date('tglcuti');
    });

    // Ambil data cuti yang (DIKONFIRMASI) dan insert ke tabel sementara
    const cuti = await trx('karyawan as a')
      .select('a.absen_id', 'c.tglcuti')
      .innerJoin('cuti as b', 'a.id', 'b.karyawan_id')
      .innerJoin('cutidetail as c', 'b.id', 'c.cuti_id')
      .where('a.cabang_id', cabangId)
      .whereRaw('ISNULL(a.absen_id, 0) <> 0')
      .andWhereRaw('ISNULL(b.statuscuti, 0) = 151')
      .whereBetween('c.tglcuti', [startDate, endDate]);
    const cutiData = cuti.map((c) => ({
      absen_id: c.absen_id,
      tglcuti: c.tglcuti.toISOString().slice(0, 10),
    }));

    await trx.batchInsert(tempCuti, cutiData, 500);
    console.log(await trx(tempCuti));
    // Ambil data hari libur
    const harilibur = await trx('harilibur')
      .whereBetween('tgl', [startDate, endDate])
      .select('tgl');

    const liburSet = new Set(
      harilibur.map((l) => l.tgl.toISOString().slice(0, 10)), // Ubah tanggal ke format YYYY-MM-DD
    );

    // Query data untuk laporan rekapitulasi
    const rows = await trx(`${tanggalTemp} as t`)
      .leftJoin(tempLogMasuk + ' as masuk', function () {
        this.on('t.absen_id', '=', 'masuk.absen_id').andOn(
          't.tgl',
          '=',
          'masuk.tgl',
        );
      })
      .leftJoin(tempLogPulang + ' as pulang', function () {
        this.on('t.absen_id', '=', 'pulang.absen_id').andOn(
          't.tgl',
          '=',
          'pulang.tgl',
        );
      })

      .leftJoin(shiftTemp + ' as s', function () {
        this.on('t.absen_id', '=', 's.absen_id').andOn(
          trx.raw('s.hari = DATEPART(WEEKDAY, t.tgl)'),
        );
      })
      .leftJoin(`${shiftKaryawanTemp} as k`, 't.absen_id', 'k.absen_id')
      .leftJoin(tempCuti + ' as cuti', function () {
        this.on('t.absen_id', '=', 'cuti.absen_id').andOn(
          't.tgl',
          '=',
          'cuti.tglcuti',
        );
      })
      .select(
        't.absen_id',
        't.tgl',
        'k.namakaryawan',
        'masuk.jammasuk as jammasuk',
        'pulang.jam_pulang as jampulang',
        's.batasjammasuk',
        's.jammasuk as shift_jammasuk',
        'cuti.tglcuti',
      )
      .orderBy('k.namakaryawan', 'asc');

    // Proses data untuk hasil laporan
    const hasil = rows.reduce(
      (acc, row) => {
        const {
          absen_id,
          namakaryawan,
          tgl,
          jammasuk,
          jampulang,
          batasjammasuk,
          shift_jammasuk,
          tglcuti,
        } = row;

        const key = `${absen_id}_${tgl}`;
        const hari = new Date(tgl).getDay(); // 0 = Minggu
        const isLibur =
          hari === 0 ||
          liburSet.has(
            typeof tgl === 'object' && tgl instanceof Date
              ? tgl.toISOString().slice(0, 10) // Jika tgl adalah objek Date
              : tgl.slice(0, 10), // Jika tgl sudah berupa string dengan format YYYY-MM-DD
          );

        const isCuti = tglcuti != null;
        const masuk = jammasuk != null;
        const pulang = jampulang != null;

        if (!acc[absen_id]) {
          acc[absen_id] = {
            absen_id,
            karyawan: namakaryawan,
            jumlahhari: 0,
            hadir: 0,
            absen: 0,
            terlambat: 0,
            cuti: 0,
            libur: 0,
          };
        }

        acc[absen_id].jumlahhari += 1;

        if (isLibur) acc[absen_id].libur += 1;
        else if (isCuti) acc[absen_id].cuti += 1;
        else if (!masuk && !pulang) acc[absen_id].absen += 1;
        else {
          acc[absen_id].hadir += 1;

          // Tambahkan 59 detik pada shift_jammasuk
          const shiftJamMasuk = new Date(shift_jammasuk);
          shiftJamMasuk.setSeconds(59);

          // Bandingkan jammasuk dan shift_jammasuk + 59 detik
          const jamMasuk = new Date(jammasuk);

          if (jamMasuk > shiftJamMasuk) {
            acc[absen_id].terlambat += 1;
          }
        }

        return acc;
      },
      {} as Record<number, any>,
    );

    // Mengurutkan hasil berdasarkan namakaryawan secara alfabetis
    const sortedResults = Object.values(hasil).sort(
      (a: { karyawan: string }, b: { karyawan: string }) =>
        a.karyawan.localeCompare(b.karyawan),
    );

    return sortedResults;
  }
  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:H1');
    worksheet.mergeCells('A2:H2');
    worksheet.mergeCells('A3:H3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN REKAPITULASI KEHADIRAN';
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

    // Updated headers according to the new fields
    const headers = [
      'No.',
      'Karyawan',
      'Jumlah Hari',
      'Hadir',
      'Absen',
      'Terlambat',
      'Cuti',
      'Libur',
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
      worksheet.getCell(currentRow, 2).value = row.karyawan; // Karyawan
      worksheet.getCell(currentRow, 3).value = row.jumlahhari; // Jumlah Hari
      worksheet.getCell(currentRow, 4).value = row.hadir; // Hadir
      worksheet.getCell(currentRow, 5).value = row.absen; // Absen
      worksheet.getCell(currentRow, 6).value = row.terlambat; // Terlambat
      worksheet.getCell(currentRow, 7).value = row.cuti; // Cuti
      worksheet.getCell(currentRow, 8).value = row.libur; // Libur

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
    worksheet.getColumn(4).width = 15;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 15;
    worksheet.getColumn(7).width = 15;
    worksheet.getColumn(8).width = 15;

    // Define temporary directory and file path
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_data_rekapitulasikehadiran${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  create(createRekapitulasikehadiranDto: CreateRekapitulasikehadiranDto) {
    return 'This action adds a new rekapitulasikehadiran';
  }

  findAll() {
    return `This action returns all rekapitulasikehadiran`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rekapitulasikehadiran`;
  }

  update(
    id: number,
    updateRekapitulasikehadiranDto: UpdateRekapitulasikehadiranDto,
  ) {
    return `This action updates a #${id} rekapitulasikehadiran`;
  }

  remove(id: number) {
    return `This action removes a #${id} rekapitulasikehadiran`;
  }
}
