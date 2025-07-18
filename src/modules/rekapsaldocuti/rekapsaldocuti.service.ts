import { Injectable } from '@nestjs/common';
import { CreateRekapsaldocutiDto } from './dto/create-rekapsaldocuti.dto';
import { UpdateRekapsaldocutiDto } from './dto/update-rekapsaldocuti.dto';

@Injectable()
export class RekapsaldocutiService {
  async rekapSaldoCuti(
    pidcabang: number,
    ptahun: string,
    pkaryawanid: string,
    trx: any,
  ): Promise<any> {
    try {
      const ptgldari = `${ptahun}-01-01`; // Start date of the year
      const ptglsampai = `${ptahun}-12-31`; // End date of the year

      // Temporary Tables for different queries
      const tempSaldoAwalTable =
        '##temp_saldo_awal_' + Math.random().toString(36).substring(2, 8);
      const tempMinusCutiTable =
        '##temp_minuscuti_' + Math.random().toString(36).substring(2, 8);
      const tempTerpakaiSebelumTable =
        '##temp_terpakaisebelum_' + Math.random().toString(36).substring(2, 8);

      // Create Temporary Tables
      await trx.schema.createTable(tempSaldoAwalTable, (t) => {
        t.integer('karyawanid');
        t.decimal('saldo');
      });

      await trx.schema.createTable(tempMinusCutiTable, (t) => {
        t.integer('karyawanid');
        t.decimal('minuscuti');
      });

      await trx.schema.createTable(tempTerpakaiSebelumTable, (t) => {
        t.integer('karyawanid');
        t.decimal('terpakaisebelum');
      });

      // Insert Saldo Awal data into the temporary table
      await trx.raw(
        `INSERT INTO ${tempSaldoAwalTable} (karyawanid, saldo)
        SELECT a.karyawan_id, a.saldo
        FROM saldocuti AS a
        LEFT JOIN karyawan AS b ON a.karyawan_id = b.id
        WHERE b.cabang_id = ? AND a.periodetgldari = ? AND a.periodetglsampai = ?`,
        [pidcabang, ptgldari, ptglsampai],
      );

      // Insert Minus Cuti data into the temporary table
      await trx.raw(
        `INSERT INTO ${tempMinusCutiTable} (karyawanid, minuscuti)
        SELECT a.karyawan_id, a.minuscuti
        FROM saldocuti AS a
        LEFT JOIN karyawan AS b ON a.karyawan_id = b.id
        WHERE b.cabang_id = ? AND a.periodetgldari = ? AND a.periodetglsampai = ? 
        AND a.minuscuti != 0`, // Make sure minuscuti is not zero
        [pidcabang, ptgldari, ptglsampai],
      );

      // Insert Terpakai Sebelum data into the temporary table
      await trx.raw(
        `INSERT INTO ${tempTerpakaiSebelumTable} (karyawanid, terpakaisebelum)
        SELECT a.karyawan_id, a.terpakai
        FROM saldocuti AS a
        LEFT JOIN karyawan AS b ON a.karyawan_id = b.id
        WHERE b.cabang_id = ? AND a.periodetgldari = ? AND a.periodetglsampai = ? 
        AND a.terpakai != 0`, // Make sure terpakaisebelum is not zero
        [pidcabang, ptgldari, ptglsampai],
      );

      // Main Query with LEFT JOIN to each temporary table, adding calculation for 'sisa'
      const result = await trx('karyawan as A')
        .select(
          'A.namakaryawan',
          'A.namaalias',
          'A.jabatan_id',
          'A.cabang_id',
          trx.raw('COALESCE(SA.saldo, 0) AS saldo'),
          trx.raw(
            // This is the calculation for `sisacuti` based on the logic from SP
            'COALESCE(SA.saldo, 0) - COALESCE(MC.minuscuti, 0) - COALESCE(TS.terpakaisebelum, 0) AS sisa',
          ),
          'A.id as karyawanid',
          'A.tglmasukkerja',
        )
        .leftJoin(
          trx(tempSaldoAwalTable)
            .select('karyawanid', trx.raw('MAX(saldo) AS saldo'))
            .groupBy('karyawanid')
            .as('SA'),
          'A.id',
          'SA.karyawanid',
        )
        .leftJoin(
          trx(tempMinusCutiTable)
            .select('karyawanid', trx.raw('SUM(minuscuti) AS minuscuti'))
            .groupBy('karyawanid')
            .as('MC'),
          'A.id',
          'MC.karyawanid',
        )
        .leftJoin(
          trx(tempTerpakaiSebelumTable)
            .select(
              'karyawanid',
              trx.raw('SUM(terpakaisebelum) AS terpakaisebelum'),
            )
            .groupBy('karyawanid')
            .as('TS'),
          'A.id',
          'TS.karyawanid',
        )
        .where('A.id', pkaryawanid);

      const dataMinusCuti = await trx(tempMinusCutiTable);
      const dataTerpakaiSebelum = await trx(tempTerpakaiSebelumTable);
      const dataSaldoAwal = await trx(tempSaldoAwalTable);

      return result;
    } catch (error) {
      console.error('Error in rekapSaldoCuti:', error);
      throw new Error('Failed to process rekapSaldoCuti');
    }
  }
  async rekapkartucuti(tgltransaksi: string, trx: any): Promise<any> {
    try {
      // Create temporary tables dynamically using Knex schema
      const tempMinusCutiTable =
        '##temp_minuscuti_' + Math.random().toString(36).substring(2, 8);
      const tempHangusCutiTable2 =
        '##temp_hanguscuti2_' + Math.random().toString(36).substring(2, 8);
      const tempHangusCutiTable =
        '##temp_hanguscuti_' + Math.random().toString(36).substring(2, 8);
      const tempKartuCutiTable =
        '##temp_kartucuti_' + Math.random().toString(36).substring(2, 8);
      const tempListDataTable =
        '##temp_listdata_' + Math.random().toString(36).substring(2, 8);
      const tempListDataHasilTable =
        '##temp_listdatahasil_' + Math.random().toString(36).substring(2, 8);
      const tempTempJadiTable =
        '##temp_tempjadi_' + Math.random().toString(36).substring(2, 8);

      // Create the temporary tables
      await trx.schema.createTable(tempMinusCutiTable, (t) => {
        t.integer('karyawan_id');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
        t.integer('minuscuti');
      });

      await trx.schema.createTable(tempHangusCutiTable2, (t) => {
        t.integer('karyawan_id');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
        t.integer('hanguscuti');
      });

      await trx.schema.createTable(tempHangusCutiTable, (t) => {
        t.integer('karyawan_id');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
        t.integer('hanguscuti');
      });

      await trx.schema.createTable(tempKartuCutiTable, (t) => {
        t.integer('karyawan_id');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
        t.datetime('tgltransaksi');
        t.string('jenistransaksi');
        t.integer('masuk');
        t.integer('keluar');
      });

      await trx.schema.createTable(tempListDataTable, (t) => {
        t.integer('karyawan_id');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
        t.datetime('tgltransaksi');
        t.string('jenistransaksi');
        t.integer('masuk');
        t.integer('keluar');
        t.integer('qtysaldo');
      });

      await trx.schema.createTable(tempListDataHasilTable, (t) => {
        t.increments('id');
        t.integer('karyawan_id');
        t.datetime('periodetgldari');
        t.datetime('periodetglsampai');
        t.datetime('tgltransaksi');
        t.string('jenistransaksi');
        t.integer('masuk');
        t.integer('keluar');
        t.integer('qtysaldo');
      });

      await trx.schema.createTable(tempTempJadiTable, (t) => {
        t.integer('karyawan_id');
        t.integer('id');
      });
      // Correct query to insert into tempMinusCutiTable with SUM calculation
      await trx.raw(
        `
        INSERT INTO ${tempMinusCutiTable} (karyawan_id, periodetgldari, periodetglsampai, minuscuti)
        SELECT 
          A.karyawan_id, 
          A.periodetgldari, 
          A.periodetglsampai, 
          SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS minuscuti
        FROM 
          kartucuti AS A
        WHERE 
          A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)
          AND A.tgltransaksi <= ?
        GROUP BY 
          A.karyawan_id, 
          A.periodetgldari, 
          A.periodetglsampai
        HAVING 
          SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) > 0
      `,
        [tgltransaksi],
      );

      // Delete records where minuscuti > 0
      await trx(tempMinusCutiTable).where('minuscuti', '>', 0).del();

      // Step 2: Insert into #temphanguscuti2
      await trx.raw(
        `
        INSERT INTO ${tempHangusCutiTable2} (karyawan_id, periodetgldari, periodetglsampai, hanguscuti)
        SELECT 
          A.karyawan_id, 
          A.periodetgldari, 
          A.periodetglsampai, 
          SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS hanguscuti
        FROM 
          kartucuti AS A
        WHERE 
          A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)
          AND A.tgltransaksi <= ?
        GROUP BY 
          A.karyawan_id, 
          A.periodetgldari, 
          A.periodetglsampai
        HAVING 
          SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) > 0
      `,
        [tgltransaksi],
      );

      // Delete records where hanguscuti <= 0
      await trx(tempHangusCutiTable2).where('hanguscuti', '<=', 0).del();

      // Step 3: Insert into #temphanguscuti
      await trx.raw(
        `
        INSERT INTO ${tempHangusCutiTable} (karyawan_id, periodetgldari, periodetglsampai, hanguscuti)
        SELECT 
          A.karyawan_id, 
          A.periodetgldari, 
          A.periodetglsampai, 
          SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) AS hanguscuti
        FROM 
          kartucuti AS A
        LEFT JOIN ${tempMinusCutiTable} AS B 
          ON A.karyawan_id = B.karyawan_id
          AND A.periodetgldari = B.periodetgldari
          AND A.periodetglsampai = B.periodetglsampai
        WHERE 
          A.periodetglsampai <= CAST(FORMAT(GETDATE(), 'yyyy/MM/dd') AS DATETIME)
          AND A.tgltransaksi <= ?
        GROUP BY 
          A.karyawan_id, 
          A.periodetgldari, 
          A.periodetglsampai
        HAVING 
          SUM(ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0)) > 0
      `,
        [tgltransaksi],
      );

      // Delete records where hanguscuti <= 0
      await trx(tempHangusCutiTable).where('hanguscuti', '<=', 0).del();

      // Step 4: Insert into #tempkartucuti
      await trx(tempKartuCutiTable).insert(
        trx(tempKartuCutiTable)
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            'A.tgltransaksi',
            'A.jenistransaksi',
            'A.masuk',
            'A.keluar',
          )
          .from('kartucuti as A')
          .where('A.tgltransaksi', '<=', tgltransaksi)
          .andWhere(
            trx.raw(
              'ISNULL(CAST(A.masuk AS INT), 0) - ISNULL(CAST(A.keluar AS INT), 0) <> 0',
            ),
          )
          .orderBy('A.tgltransaksi'),
      );

      // Step 5: Insert into #Templistdata
      await trx(tempListDataTable).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            'A.tgltransaksi',
            'A.jenistransaksi',
            'A.masuk',
            'A.keluar',
            trx.raw(`
              (SELECT SUM(ISNULL(CAST(A2.masuk AS INT), 0) - ISNULL(CAST(A2.masuk AS INT), 0))
               FROM ${tempKartuCutiTable} AS A2
               WHERE A2.karyawan_id = A.karyawan_id
               AND A2.tgltransaksi <= A.tgltransaksi
               ) AS qtysaldo`),
          )
          .from(`${tempKartuCutiTable} AS A`)
          .orderBy('A.karyawan_id', 'A.tgltransaksi'),
      );

      // Delete records where jenistransaksi = 'hangus cuti' and qtysaldo <> 0
      await trx(tempListDataTable)
        .where('jenistransaksi', 'hangus cuti')
        .andWhere('qtysaldo', '<>', 0)
        .del();

      // Step 6: Insert into #Templistdatahasil
      await trx(tempListDataHasilTable).insert(
        trx
          .select(
            'A.karyawan_id',
            'A.periodetgldari',
            'A.periodetglsampai',
            'A.tgltransaksi',
            'A.jenistransaksi',
            'A.masuk',
            'A.keluar',
            trx.raw(`
              (SELECT SUM(ISNULL(CAST(A2.masuk AS INT), 0) - ISNULL(CAST(A2.keluar AS INT), 0))
               FROM ${tempListDataTable} AS A2
               WHERE A2.karyawan_id = A.karyawan_id
               AND A2.tgltransaksi <= A.tgltransaksi
               ) AS qtysaldo`),
          )
          .from(`${tempListDataTable} AS A`)
          .orderBy('A.karyawan_id', 'A.tgltransaksi'),
      );

      // Step 7: Insert into #Tempjadi
      await trx(tempTempJadiTable).insert(
        trx
          .select('A.karyawan_id', trx.raw('MAX(A.id) AS id'))
          .from(tempListDataHasilTable + ' AS A')
          .groupBy('A.karyawan_id'),
      );

      const datatempTempJadiTable = await trx(tempTempJadiTable);
      const datatempListDataHasilTable = await trx(tempListDataHasilTable);
      // Step 8: Retrieve final result
      const result = await trx('karyawan as A')
        .select('A.namakaryawan', trx.raw('COALESCE(C.qtysaldo, 0) AS saldo'))
        .innerJoin(
          trx(tempTempJadiTable).select('karyawan_id', 'id').as('B'),
          'A.id',
          'B.karyawan_id',
        )
        .innerJoin(
          trx(tempListDataHasilTable)
            .select('karyawan_id', 'id', 'qtysaldo')
            .as('C'),
          function () {
            this.on('A.id', 'C.karyawan_id').andOn('B.id', 'C.id'); // Add the condition here
          },
        )
        .orderBy('A.namakaryawan');

      // Cleanup: Drop the temporary tables
      await trx.raw(`DROP TABLE IF EXISTS ${tempMinusCutiTable}`);
      await trx.raw(`DROP TABLE IF EXISTS ${tempHangusCutiTable2}`);
      await trx.raw(`DROP TABLE IF EXISTS ${tempHangusCutiTable}`);
      await trx.raw(`DROP TABLE IF EXISTS ${tempKartuCutiTable}`);
      await trx.raw(`DROP TABLE IF EXISTS ${tempListDataTable}`);
      await trx.raw(`DROP TABLE IF EXISTS ${tempListDataHasilTable}`);
      await trx.raw(`DROP TABLE IF EXISTS ${tempTempJadiTable}`);

      return result;
    } catch (error) {
      console.error('Error in rekapkartucuti:', error);
      throw new Error('Failed to process rekapkartucuti');
    }
  }
  create(createRekapsaldocutiDto: CreateRekapsaldocutiDto) {
    return 'This action adds a new rekapsaldocuti';
  }

  findAll() {
    return `This action returns all rekapsaldocuti`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rekapsaldocuti`;
  }

  update(id: number, updateRekapsaldocutiDto: UpdateRekapsaldocutiDto) {
    return `This action updates a #${id} rekapsaldocuti`;
  }

  remove(id: number) {
    return `This action removes a #${id} rekapsaldocuti`;
  }
}
