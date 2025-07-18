import { Injectable, Logger } from '@nestjs/common';
import { CreateKaryawanVaksinDto } from './dto/create-karyawan_vaksin.dto';
import { UpdateKaryawanVaksinDto } from './dto/update-karyawan_vaksin.dto';
import { dbMssql } from 'src/common/utils/db';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { UtilsService } from 'src/utils/utils.service';

@Injectable()
export class KaryawanVaksinService {
  private readonly tableName: string = 'karyawan_vaksin';
  constructor(
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  private readonly logger = new Logger(KaryawanVaksinService.name);

  async createOrUpdate(
    data: any[],
    filefoto: Array<Express.Multer.File>,
    req: any,
    id: any = 0,
    trx: any,
  ) {
    try {
      const currentTime = this.utilsService.getTime();
      const time = this.utilsService.getTime();
      const mainDataToInsert: any[] = [];
      const logData: any[] = [];

      const tableName = 'karyawan_vaksin';
      const tempTable = `##temp_${Math.random().toString(36).substring(2, 15)}`;
      const tableTemp = await this.utilsService.createTempTable(
        tableName,
        trx,
        tempTable,
      );
      if (!data || data === undefined || data?.length === 0) {
        const deletedData = await trx(tableName)
          .where('karyawan_vaksin.karyawan_id', id)
          .del();
        return { success: true, message: 'success delete all data' };
      }
      // --- Bagian 1: Proses data utama (seperti sebelum insert) ---
      for (const entry of data) {
        let isDataChanged = false;
        if (entry.id && entry.id !== '0') {
          // Update record existing
          const existingData = await trx(tableName)
            .where('id', entry.id)
            .first();
          if (existingData) {
            const createdAt = {
              created_at: existingData.created_at,
              updated_at: existingData.updated_at,
            };
            Object.assign(entry, createdAt);
            if (this.utilsService.hasChanges(entry, existingData)) {
              entry.updated_at = time;
              isDataChanged = true;
              entry.aksi = 'UPDATE';
            }
          }
        } else {
          // New record
          const newTimestamps = {
            created_at: time,
            updated_at: time,
          };
          Object.assign(entry, newTimestamps);
          isDataChanged = true;
          entry.aksi = 'CREATE';
        }
        if (!isDataChanged) {
          entry.aksi = 'NO UPDATE';
        }
        const { aksi, ...dataForInsert } = entry;
        mainDataToInsert.push(dataForInsert);
        logData.push({
          ...entry,
          created_at: time,
        });
      }

      await trx.raw(tableTemp);

      // --- Bagian 2: Kelompokkan file upload berdasarkan fieldName ---
      // Kita asumsikan fieldName memiliki format: data[{index}][filefoto][{subIndex}]
      const fileGroups: { [key: number]: Express.Multer.File[] } = {};
      for (const file of filefoto) {
        // Misal fieldName: "data[0][filefoto][2]" => ambil indeks data: 0
        const match = file.fieldname.match(
          /data\[(\d+)\]\[filefoto\]\[(\d+)\]/,
        );
        if (match) {
          const dataIndex = parseInt(match[1], 10);
          if (!fileGroups[dataIndex]) {
            fileGroups[dataIndex] = [];
          }
          fileGroups[dataIndex].push(file);
        }
      }
      // fileGroups sekarang berisi misalnya: { 0: [file0, file1], 1: [file2, file3], ... }

      // --- Bagian 3: Proses setiap item dan assign filefoto secara terpisah ---
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        item.modifiedby = req?.user?.user?.username || 'unknown';
        item.created_at = currentTime;
        item.updated_at = currentTime;
        if (!item.tglvaksin || item.tglvaksin === '') {
          item.tglvaksin = null;
        } else if (typeof item.tglvaksin === 'string') {
          const [day, month, year] = item.tglvaksin.split('-');
          item.tglvaksin = `${year}-${month}-${day}`;
        }
        // Pastikan item.filefoto sudah berupa array. Jika masih string, kita parse dulu.
        if (typeof item.filefoto === 'string') {
          try {
            item.filefoto = JSON.parse(item.filefoto);
          } catch (e) {
            item.filefoto = [];
          }
        } else {
          item.filefoto = item.filefoto || [];
        }

        // Ambil file upload yang dikirim untuk data dengan indeks i (berdasarkan fieldName)
        const filesForThisItem = fileGroups[i] || [];
        if (filesForThisItem.length > 0) {
          const compressedFileNames = await Promise.all(
            filesForThisItem.map(async (file) => {
              return await this.utilsService.compressImage(file);
            }),
          );
          // Gabungkan file yang sudah ada dengan file baru
          item.filefoto = [...item.filefoto, ...compressedFileNames];
        }

        // Simpan filefoto sebagai string JSON untuk disimpan ke database
        item.filefoto = JSON.stringify(item.filefoto);

        await trx.raw(
          `
            INSERT INTO ${tempTable} 
            (id, karyawan_id, tglvaksin, keterangan, statusaktif, info, filefoto, created_at, updated_at, modifiedby)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            item.id || null,
            item.karyawan_id,
            item.tglvaksin,
            item.keterangan,
            item.statusaktif,
            item.info,
            item.filefoto,
            item.created_at,
            item.updated_at,
            item.modifiedby,
          ],
        );
      }

      // --- Bagian 4: Update data utama berdasarkan temporary table ---
      await trx.raw(`
            UPDATE main
            SET 
              main.karyawan_id = temp.karyawan_id,
              main.tglvaksin = temp.tglvaksin,
              main.keterangan = temp.keterangan,
              main.statusaktif = temp.statusaktif,
              main.info = temp.info,
              main.filefoto = temp.filefoto,
              main.modifiedby = temp.modifiedby,
              main.updated_at = temp.updated_at
            FROM karyawan_vaksin main
            INNER JOIN ${tempTable} temp ON main.id = temp.id
            WHERE temp.id IS NOT NULL;
      `);

      const insertedDataQuery = await trx(tempTable)
        .select([
          'tglvaksin',
          'filefoto',
          'keterangan',
          'statusaktif',
          'info',
          'karyawan_id',
          'created_at',
          'updated_at',
          'modifiedby',
        ])
        .where(`${tempTable}.id`, '0');

      const deletedData = await trx(tableName)
        .leftJoin(`${tempTable}`, 'karyawan_vaksin.id', `${tempTable}.id`)
        .whereNull(`${tempTable}.id`)
        .where('karyawan_vaksin.karyawan_id', data[0].karyawan_id)
        .del();

      let insertedData = null;
      if (insertedDataQuery.length > 0) {
        insertedData = await trx('karyawan_vaksin')
          .insert(insertedDataQuery)
          .returning('*')
          .then((result: any) => result[0])
          .catch((error: any) => {
            console.error('Error inserting data:', error);
            throw error;
          });
      }

      return { success: true };
    } catch (error) {
      throw new Error(`Error in createOrUpdate: ${error.message}`);
    }
  }

  async findAll(karyawan_id: number, sortBy: string, sortDirection: string) {
    const result = await dbMssql('karyawan_vaksin')
      .select(
        'karyawan_vaksin.id',
        'karyawan_vaksin.karyawan_id',
        dbMssql.raw(
          "FORMAT(karyawan_vaksin.tglvaksin, 'dd-MM-yyyy') as tglvaksin",
        ),
        'karyawan_vaksin.filefoto',
        'karyawan_vaksin.keterangan',
        'karyawan_vaksin.statusaktif',
        'p.text',
        'karyawan_vaksin.info',
        dbMssql.raw(
          "FORMAT(karyawan_vaksin.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
        ),
        dbMssql.raw(
          "FORMAT(karyawan_vaksin.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
        ),
      )
      .leftJoin('parameter as p', 'p.id', 'karyawan_vaksin.statusaktif')
      .where('karyawan_vaksin.karyawan_id', karyawan_id)
      .orderBy(sortBy, sortDirection); // Use dynamic sorting

    if (!result.length) {
      this.logger.warn(`No Data found for ID: ${karyawan_id}`);
      return {
        status: false,
        message: 'No data found',
        data: [],
      };
    }

    return {
      status: true,
      message: 'ACL data fetched successfully',
      data: result,
    };
  }

  findOne(id: number) {
    return `This action returns a #${id} karyawanVaksin`;
  }

  update(id: number, updateKaryawanVaksinDto: UpdateKaryawanVaksinDto) {
    return `This action updates a #${id} karyawanVaksin`;
  }

  remove(id: number) {
    return `This action removes a #${id} karyawanVaksin`;
  }
}
