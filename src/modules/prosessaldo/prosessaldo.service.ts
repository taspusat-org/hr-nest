import { Injectable } from '@nestjs/common';
import { CreateProsessaldoDto } from './dto/create-prosessaldo.dto';
import { UpdateProsessaldoDto } from './dto/update-prosessaldo.dto';
import { RekapsaldocutiService } from '../rekapsaldocuti/rekapsaldocuti.service';

@Injectable()
export class ProsessaldoService {
  constructor(private readonly rekapSaldoService: RekapsaldocutiService) {}
  async prosesSaldoKartuCuti(ptgl: string, trx: any): Promise<void> {
    try {
      // Set date format to start weeks on Monday
      await trx.raw('SET DATEFIRST 1');
      const [d, m, y] = ptgl.split('-').map((s) => parseInt(s, 10));
      const yearStr = y.toString();
      const monthNum = m; // 1–12
      const dayNum = d; // 1–31
      const ptglFormatted = this.convertToSQLDateFormat(ptgl);
      // Create temporary tables for employees (tempKaryawan1Tahun, tempKaryawanPerPeriode, and tempKaryawanOther)
      const tempKaryawan1Tahun =
        '##tempKaryawan1Tahun_' + Math.random().toString(36).substring(2, 8);
      const tempKaryawanPerPeriode =
        '##tempKaryawanPerPeriode_' +
        Math.random().toString(36).substring(2, 8);
      const tempKaryawanOther =
        '##tempKaryawanOther_' + Math.random().toString(36).substring(2, 8);

      const dataCabangMasukKerja = await trx('cabang').where('periode', 155);
      const idsCabangMasukKerja = dataCabangMasukKerja.map(
        (cabang) => cabang.id,
      );
      // Create Temporary Table for employees (tempKaryawan1Tahun)
      await trx.schema.createTable(tempKaryawan1Tahun, (t) => {
        t.integer('karyawan_id');
        t.integer('cabang_id');
        t.string('namakaryawan');
        t.datetime('tglmasukkerja');
      });
      // Create Temporary Table for employees (tempKaryawanPerPeriode)
      await trx.schema.createTable(tempKaryawanPerPeriode, (t) => {
        t.integer('karyawan_id');
        t.integer('cabang_id');
        t.string('namakaryawan');
        t.datetime('tglmasukkerja');
      });

      // Create Temporary Table for employees (tempKaryawanOther)
      await trx.schema.createTable(tempKaryawanOther, (t) => {
        t.integer('karyawan_id');
        t.integer('cabang_id');
        t.string('namakaryawan');
        t.datetime('tglmasukkerja');
        t.integer('masuk'); // We will calculate the masuk value here
      });

      // Step 1: Insert employees into tempKaryawan1Tahun (only if ptgl is 01-01)
      if (monthNum === 1 && dayNum === 1) {
        await trx(tempKaryawan1Tahun).insert(
          trx
            .select('id', 'cabang_id', 'namakaryawan', 'tglmasukkerja')
            .whereNotIn('cabang_id', idsCabangMasukKerja)
            .from('karyawan')
            .whereNull('tglresign'),
        );
      }

      // Step 2: Insert employees into tempKaryawanPerPeriode (for cabang_id 28 and 29)
      await trx(tempKaryawanPerPeriode).insert(
        trx
          .select('id', 'cabang_id', 'namakaryawan', 'tglmasukkerja')
          .from('karyawan')
          .whereIn('cabang_id', idsCabangMasukKerja)
          .whereNull('tglresign')
          .whereRaw('MONTH(tglmasukkerja) = ?', [monthNum])
          .whereRaw('DAY(tglmasukkerja) = ?', [dayNum]),
      );

      // Step 3: Insert employees into tempKaryawanOther (for non-cabang_id 28 and 29 and tglmasukkerja equal to ptgl)
      await trx(tempKaryawanOther).insert(
        trx
          .select('id', 'cabang_id', 'namakaryawan', 'tglmasukkerja')
          .select(
            trx.raw('12 - MONTH(tglmasukkerja) AS masuk'), // Calculate masuk based on months
          )
          .from('karyawan')
          .whereNotIn('cabang_id', idsCabangMasukKerja)
          .whereNull('tglresign')
          .whereRaw('MONTH(tglmasukkerja) = ?', [monthNum]) // Check if month matches ptgl
          .whereRaw('DAY(tglmasukkerja) = ?', [dayNum]) // Check if day matches ptgl
          .whereRaw('YEAR(tglmasukkerja) = ?', [y - 1]), // Ensure tglmasukkerja is 1 year before ptgl
      );

      // Step 4: Insert into kartucuti for tempKaryawan1Tahun (for New Year's Day)
      if (monthNum === 1 && dayNum === 1) {
        await trx('kartucuti').insert(
          trx
            .select('karyawan_id', 'cabang_id')
            .select(
              trx.raw('CAST(? AS DATE) AS periodetgldari', [
                `01-01-${yearStr}`,
              ]),
            )
            .select(
              trx.raw('CAST(? AS DATE) AS periodetglsampai', [
                `01-01-${y + 1}`,
              ]),
            )
            .select(trx.raw('GETDATE() AS tgltransaksi'))
            .select(trx.raw("'SALDOAWAL' AS jenistransaksi"))
            .select(trx.raw('12 AS masuk'))
            .select(trx.raw('0 AS keluar'))
            .select(trx.raw('GETDATE() AS created_at'))
            .select(trx.raw('GETDATE() AS updated_at'))
            .select(trx.raw('NULL AS cuti_id')) // Menambahkan cuti_id dengan NULL
            .from(tempKaryawan1Tahun)
            .whereRaw(
              'DATEDIFF(DAY, tglmasukkerja, ?) >= 365', // Check if tglmasukkerja is at least 365 days ago
              [ptglFormatted],
            ),
        );
      }

      await trx('kartucuti').insert(
        trx
          .select('karyawan_id', 'cabang_id')
          .select(trx.raw('CAST(? AS DATE) AS periodetgldari', [ptglFormatted])) // periodetgldari = ptgl
          .select(
            trx.raw(
              'DATEADD(DAY, -1, DATEADD(YEAR, 1, CAST(? AS DATE))) AS periodetglsampai',
              [ptglFormatted],
            ),
          ) // periodetglsampai = ptgl + 1 year - 1 day
          .select(trx.raw('GETDATE() AS tgltransaksi'))
          .select(trx.raw("'SALDOAWAL' AS jenistransaksi"))
          .select(trx.raw('12 AS masuk'))
          .select(trx.raw('0 AS keluar'))
          .select(trx.raw('GETDATE() AS created_at'))
          .select(trx.raw('GETDATE() AS updated_at'))
          .select(trx.raw('NULL AS cuti_id'))
          .from(tempKaryawanPerPeriode)
          .whereRaw(
            'DATEDIFF(DAY, tglmasukkerja, ?) >= 365', // Check if tglmasukkerja is at least 365 days ago
            [ptglFormatted],
          ),
      );
      // Step 6: Insert into kartucuti for tempKaryawanOther
      await trx('kartucuti').insert(
        trx
          .select('karyawan_id', 'cabang_id')
          .select(trx.raw('CAST(? AS DATE) AS periodetgldari', [ptglFormatted])) // periodetgldari = ptgl
          .select(
            trx.raw(
              'CAST(DATEFROMPARTS(YEAR(CAST(? AS DATE)), 12, 31) AS DATE) AS periodetglsampai',
              [ptglFormatted],
            ),
          ) // periodetglsampai = end of the year (31-12-YYYY)
          .select(trx.raw('GETDATE() AS tgltransaksi')) // Set transaction date to current timestamp
          .select(trx.raw("'SALDOAWAL' AS jenistransaksi")) // Jenistransaksi = 'SALDOAWAL'
          .select('masuk') // Use the dynamically calculated "masuk" value
          .select(trx.raw('0 AS keluar')) // saldo keluar as 0 initially
          .select(trx.raw('GETDATE() AS created_at')) // Set created_at to current timestamp
          .select(trx.raw('GETDATE() AS updated_at')) // Set updated_at to current timestamp
          .select(trx.raw('NULL AS cuti_id'))
          .from(tempKaryawanOther),
      );

      // Clean up temporary tables
      await trx.schema.dropTableIfExists(tempKaryawan1Tahun);
      await trx.schema.dropTableIfExists(tempKaryawanPerPeriode);
      await trx.schema.dropTableIfExists(tempKaryawanOther);

      return;
    } catch (error) {
      console.error('Error in prosesSaldoAwal:', error);
      throw new Error('Failed to process saldo awal');
    }
  }

  async prosesSaldo(ptgl: string, trx: any): Promise<void> {
    try {
      // Set date format to start weeks on Monday
      await trx.raw('SET DATEFIRST 1');
      const [d, m, y] = ptgl.split('-').map((s) => parseInt(s, 10));
      const yearStr = y.toString();
      const monthNum = m; // 1–12
      const dayNum = d; // 1–31
      const periodDari = `${yearStr}-01-01`;
      const periodSampai = `${yearStr}-12-31`;
      const ptglFormatted = this.convertToSQLDateFormat(ptgl);
      // Step 1: Create temporary tables
      const tempKaryawan1Tahun =
        'tempKaryawan1Tahun_' + Math.random().toString(36).substring(2, 8);
      const tempKaryawanAKhirPriode =
        'tempKaryawanAKhirPriode_' + Math.random().toString(36).substring(2, 8);
      const tempSisaCuti =
        'tempSisaCuti_' + Math.random().toString(36).substring(2, 8);
      const tempCabang =
        'tempCabang_' + Math.random().toString(36).substring(2, 8);
      const nextYear = parseInt(yearStr, 10) + 1;
      const dataCabangMasukKerja = await trx('cabang').where('periode', 155);
      const idsCabangMasukKerja = dataCabangMasukKerja.map(
        (cabang) => cabang.id,
      );
      // Create Temporary Tables
      await trx.schema.createTable(tempKaryawan1Tahun, (t) => {
        t.integer('id');
        t.integer('cabang_id');
        t.string('namakaryawan');
        t.datetime('tglmasukkerja');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
      });

      await trx.schema.createTable(tempKaryawanAKhirPriode, (t) => {
        t.integer('id');
        t.integer('cabang_id');
        t.string('namakaryawan');
        t.datetime('tglmasukkerja');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
      });

      await trx.schema.createTable(tempSisaCuti, (t) => {
        t.string('namakaryawan');
        t.string('namaalias');
        t.integer('jabatan_id');
        t.integer('cabang_id');
        t.integer('saldo');
        t.integer('sisa');
        t.integer('karyawan_id');
        t.datetime('tglmasukkerja');
        t.datetime('periodetgldari'); // Add periodetgldari
        t.datetime('periodetglsampai'); // Add periodetglsampai
      });

      await trx.schema.createTable(tempCabang, (t) => {
        t.integer('cabang_id');
      });

      // Step 2: Insert data into temp tables
      await trx(tempKaryawan1Tahun).insert(
        trx
          .select('id', 'cabang_id', 'namakaryawan', 'tglmasukkerja')
          .select(
            trx.raw(
              `CASE WHEN cabang_id IN (28, 29, 1135) THEN ? ELSE CONVERT(DATETIME, ?, 120) END AS periodetgldari`,
              [ptglFormatted, `${yearStr}-01-01`], // If cabang_id in (28,29,1135) use ptgl, else use start of the year
            ),
          )
          .select(
            trx.raw(
              `CASE 
                WHEN cabang_id IN (28, 29, 1135) 
                THEN CAST(LTRIM(RTRIM(STR(? + 1))) + '/' + LTRIM(RTRIM(STR(?))) + '/' + LTRIM(RTRIM(STR(?))) AS DATETIME) - 1
                ELSE CAST(LTRIM(RTRIM(STR(?))) + '/12/31' AS DATETIME)
              END AS periodetglsampai`,
              [
                yearStr, // year + 1 (untuk pengurangan tahun)
                monthNum, // bulan (month)
                dayNum, // hari (day)
                yearStr, // tahun tanpa perubahan untuk 31 Desember
              ],
            ),
          )
          .from('karyawan')
          .where(
            'tglmasukkerja',
            trx.raw(
              "CAST(LTRIM(RTRIM(STR(?-1))) + '/' + LTRIM(RTRIM(STR(?))) + '/' + LTRIM(RTRIM(STR(?))) AS DATETIME)",
              [yearStr, monthNum, dayNum],
            ),
          )
          .whereNull('tglresign')
          .whereNotIn('cabang_id', idsCabangMasukKerja),
      );

      await trx(tempKaryawanAKhirPriode).insert(
        trx
          .select('id', 'cabang_id', 'namakaryawan', 'tglmasukkerja')
          .select(
            trx.raw(
              `CASE WHEN cabang_id IN (28, 29, 1135) THEN ? ELSE CONVERT(DATETIME, ?, 120) END AS periodetgldari`,
              [ptglFormatted, `${yearStr}-01-01`], // If cabang_id in (28,29,1135) use ptgl, else use start of the year
            ),
          )
          .select(
            trx.raw(
              `CASE 
                WHEN cabang_id IN (28, 29, 1135) 
                THEN CAST(LTRIM(RTRIM(STR(? + 1))) + '/' + LTRIM(RTRIM(STR(?))) + '/' + LTRIM(RTRIM(STR(?))) AS DATETIME) - 1
                ELSE CAST(LTRIM(RTRIM(STR(?))) + '/1/1' AS DATETIME)
              END AS periodetglsampai`,
              [
                yearStr, // year + 1 (untuk pengurangan tahun)
                monthNum, // bulan (month)
                dayNum, // hari (day)
                yearStr, // tahun tanpa perubahan untuk 31 Desember
              ],
            ),
          )
          .from('karyawan')
          .whereRaw('MONTH(tglmasukkerja) = ?', [monthNum])
          .whereNull('tglresign')
          .whereRaw('DAY(tglmasukkerja) = ?', [dayNum])
          .whereIn('cabang_id', idsCabangMasukKerja),
      );
      // Step 3: Update saldo cuti for employees from TempKaryawanAKhirPriode
      await trx('saldocuti')
        .update({
          saldo: 12,
        })
        .whereIn(
          'karyawan_id',
          trx(tempKaryawanAKhirPriode)
            .select('id')
            .whereRaw('periodetgldari = ?', [periodDari])
            .whereRaw('periodetglsampai = ?', [periodSampai]),
        );

      await trx('saldocuti').insert(
        trx
          .select('A.id', 'A.periodetgldari', 'A.periodetglsampai')
          .select(trx.raw('12 AS saldo')) // Set saldo as 12

          .select(trx.raw('0 AS terpakai')) // Set Terpakai as money
          .select(trx.raw('NULL AS info')) // Set info as NULL
          .select(trx.raw('NULL AS modifiedby')) // Set modifiedby as NULL
          .select(trx.raw('GETDATE() AS created_at')) // Set created_at to current timestamp
          .select(trx.raw('GETDATE() AS updated_at')) // Set updated_at to current timestamp
          .select(trx.raw('CAST(0 AS money) AS minuscuti')) // Set minuscuti as money
          .select(trx.raw('CAST(0 AS money) AS terpakaisebelum')) // Set terpakaisebelum as money
          .select(trx.raw('CAST(0 AS money) AS prediksi')) // Set prediksi as money

          .from(`${tempKaryawanAKhirPriode} AS A`)
          .leftJoin('saldocuti AS B', function () {
            this.on('A.id', '=', 'B.karyawan_id')
              .andOn('A.periodetgldari', '=', 'B.periodetgldari')
              .andOn('A.periodetglsampai', '=', 'B.periodetglsampai');
          })
          .whereIn('A.cabang_id', idsCabangMasukKerja)
          .whereNull('B.karyawan_id'), // Ensure only missing entries are inserted
      );

      await trx('saldocuti')
        .join(
          `${tempKaryawanAKhirPriode} as b`,
          'saldocuti.karyawan_id',
          'b.id',
        )
        .where('saldocuti.periodetgldari', periodDari)
        .where('saldocuti.periodetglsampai', periodSampai)
        .update({
          saldo: trx.raw('(12 - MONTH(b.tglmasukkerja)) + 1'),
        });

      await trx('saldocuti').insert(
        trx
          .select('A.id', 'A.periodetgldari', 'A.periodetglsampai')
          .select(trx.raw('(12 - MONTH(A.tglmasukkerja)) + 1 AS saldo')) // Set saldo as 12

          .select(trx.raw('0 AS terpakai')) // Set Terpakai as money
          .select(trx.raw('NULL AS info')) // Set info as NULL
          .select(trx.raw('NULL AS modifiedby')) // Set modifiedby as NULL
          .select(trx.raw('GETDATE() AS created_at')) // Set created_at to current timestamp
          .select(trx.raw('GETDATE() AS updated_at')) // Set updated_at to current timestamp
          .select(trx.raw('CAST(0 AS money) AS minuscuti')) // Set minuscuti as money
          .select(trx.raw('CAST(0 AS money) AS terpakaisebelum')) // Set terpakaisebelum as money
          .select(trx.raw('CAST(0 AS money) AS prediksi')) // Set prediksi as money

          .from(`${tempKaryawan1Tahun} AS A`)
          .leftJoin('saldocuti AS B', function () {
            this.on('A.id', '=', 'B.karyawan_id')
              .andOn('A.periodetgldari', '=', 'B.periodetgldari')
              .andOn('A.periodetglsampai', '=', 'B.periodetglsampai');
          })
          .whereNotIn('A.cabang_id', idsCabangMasukKerja)
          .whereNull('B.karyawan_id'), // Ensure only missing entries are inserted
      );
      // Step 5: Process SisaCuti based on cursor-like processing
      const cabangIds = [26, 27, 30, 31]; // Same as SQL Server cursor
      for (let i = 0; i < cabangIds.length; i++) {
        const cabangId = cabangIds[i];

        // Extract year from ptgl (assumes ptgl is in DD-MM-YYYY format)
        const [day, month, year] = ptgl.split('-').map((s) => parseInt(s, 10));

        // Convert to string (use the extracted year from ptgl)
        const tahun = year.toString();

        const karyawanIds = await trx('karyawan')
          .select('id') // Select karyawan_id, not id
          .where('cabang_id', cabangId);

        for (let j = 0; j < karyawanIds.length; j++) {
          const karyawanId = karyawanIds[j].karyawan_id;

          // Check if karyawanId is valid before calling rekapSaldoCuti
          if (karyawanId != null) {
            // Call rekapSaldoCutiService for each employee with year extracted from ptgl
            await this.rekapSaldoService.rekapSaldoCuti(
              cabangId,
              tahun, // Use the extracted year from ptgl
              karyawanId.toString(),
              trx,
            );
          }
        }
      }

      // Step 6: Update saldocuti based on #SisaCuti
      await trx.raw(`
        UPDATE saldocuti
        SET minuscuti = ABS(B.sisa)
        FROM ${tempSisaCuti} B
        INNER JOIN saldocuti A
          ON A.karyawan_id = B.karyawan_id
        WHERE B.sisa < 0
      `);

      const atgl1 = `${nextYear}-01-01`; // Set start date for the next year
      const atgl2 = `${nextYear}-12-31`; // Set end date for the next year

      await trx('saldocuti').insert(
        trx
          .select('A.karyawan_id')
          .select(trx.raw('CAST(? AS DATE) AS periodetgldari', [atgl1])) // Ensure atgl1 is in DATE format
          .select(trx.raw('CAST(? AS DATE) AS periodetglsampai', [atgl2])) // Ensure atgl2 is in DATE format
          .select(trx.raw('12 AS saldo')) // Set saldo as 12
          .select(trx.raw('0 AS terpakai')) // Set terpakai as 0
          .select(trx.raw('NULL AS info')) // Set info as NULL
          .select(trx.raw('NULL AS modifiedby')) // Set modifiedby as NULL
          .select(trx.raw('GETDATE() AS created_at')) // Set created_at to current timestamp
          .select(trx.raw('GETDATE() AS updated_at')) // Set updated_at to current timestamp
          .select(trx.raw('CAST(0 AS money) AS minuscuti')) // Set minuscuti as money
          .select(trx.raw('CAST(0 AS money) AS terpakaisebelum')) // Set terpakaisebelum as money
          .select(trx.raw('CAST(0 AS money) AS prediksi')) // Set prediksi as money
          .from(`${tempSisaCuti} AS A`)
          .leftJoin('saldocuti AS B', function () {
            this.on('A.karyawan_id', '=', 'B.karyawan_id')
              .andOn('A.periodetgldari', '=', 'B.periodetgldari')
              .andOn('A.periodetglsampai', '=', 'B.periodetglsampai');
          })
          .whereIn('A.cabang_id', idsCabangMasukKerja)
          .whereNull('B.karyawan_id'), // Ensure only missing entries are inserted
      );

      // Clean up temporary tables
      await trx.schema.dropTableIfExists(tempKaryawan1Tahun);
      await trx.schema.dropTableIfExists(tempKaryawanAKhirPriode);
      await trx.schema.dropTableIfExists(tempSisaCuti);
      await trx.schema.dropTableIfExists(tempCabang);

      return;
    } catch (error) {
      console.error('Error in prosesSaldo:', error);
      throw new Error('Failed to process saldo');
    }
  }

  private convertToSQLDateFormat(ptgl: string): string {
    const [day, month, year] = ptgl.split('-'); // Split the date as MM-DD-YYYY
    const date = new Date(`${year}-${month}-${day}`); // Convert to Date object

    // Return in format YYYY-MM-DD
    return date.toISOString().split('T')[0]; // Ensure the date is in the correct format for SQL
  }

  create(createProsessaldoDto: CreateProsessaldoDto) {
    return 'This action adds a new prosessaldo';
  }

  findAll() {
    return `This action returns all prosessaldo`;
  }

  findOne(id: number) {
    return `This action returns a #${id} prosessaldo`;
  }

  update(id: number, updateProsessaldoDto: UpdateProsessaldoDto) {
    return `This action updates a #${id} prosessaldo`;
  }

  remove(id: number) {
    return `This action removes a #${id} prosessaldo`;
  }
}
