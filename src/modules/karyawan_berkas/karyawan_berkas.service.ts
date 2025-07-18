import { Injectable, Logger } from '@nestjs/common';
import { CreateKaryawanBerkaDto } from './dto/create-karyawan_berka.dto';
import { UpdateKaryawanBerkaDto } from './dto/update-karyawan_berka.dto';
import { dbMssql } from 'src/common/utils/db';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { UtilsService } from 'src/utils/utils.service';

@Injectable()
export class KaryawanBerkasService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  private readonly logger = new Logger(KaryawanBerkasService.name);

  async createOrUpdate(
    data: any[],
    fileberkas: Array<Express.Multer.File>,
    user: any,
    id: any,
    trx: any,
  ) {
    try {
      const currentTime = this.utilsService.getTime();
      const time = this.utilsService.getTime();
      const mainDataToInsert: any[] = [];
      const logData: any[] = [];

      const tableName = 'karyawan_berkas';
      const tempTable = `##temp_${Math.random().toString(36).substring(2, 15)}`;
      const tableTemp = await this.utilsService.createTempTable(
        tableName,
        trx,
        tempTable,
      );
      // --- Bagian 1: Proses data utama (seperti sebelum insert) ---
      if (!data || data === undefined || data?.length === 0) {
        // If data is empty, delete the relevant records from the database
        const deletedData = await trx(tableName)
          .where('karyawan_berkas.karyawan_id', id)
          .del();
        return { success: true, message: 'success delete all data' };
      }

      // Process the main data if it exists
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
        const { aksi, statusberkas_text, statusaktif_text, ...dataForInsert } =
          entry;
        mainDataToInsert.push(dataForInsert);
        logData.push({
          ...entry,
          created_at: time,
        });
      }

      await trx.raw(tableTemp);

      // --- Bagian 2: Kelompokkan file upload berdasarkan fieldName ---
      const fileGroups: { [key: number]: Express.Multer.File[] } = {};
      for (const file of fileberkas) {
        const match = file.fieldname.match(
          /data\[(\d+)\]\[fileberkas\]\[(\d+)\]/,
        );
        if (match) {
          const dataIndex = parseInt(match[1], 10);
          if (!fileGroups[dataIndex]) {
            fileGroups[dataIndex] = [];
          }
          fileGroups[dataIndex].push(file);
        }
      }
      // --- Bagian 3: Proses setiap item dan assign fileberkas secara terpisah ---
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        item.modifiedby = user?.username || 'unknown';
        item.created_at = currentTime;
        item.updated_at = currentTime;

        if (typeof item.fileberkas === 'string') {
          try {
            item.fileberkas = JSON.parse(item.fileberkas);
          } catch (e) {
            item.fileberkas = [];
          }
        } else {
          item.fileberkas = item.fileberkas || [];
        }

        const filesForThisItem = fileGroups[i] || [];
        if (filesForThisItem.length > 0) {
          const compressedFileNames = await Promise.all(
            filesForThisItem.map(async (file) => {
              return await this.utilsService.compressImage(file);
            }),
          );
          item.fileberkas = [...item.fileberkas, ...compressedFileNames];
        }

        item.fileberkas = JSON.stringify(item.fileberkas);
        await trx.raw(
          `
            INSERT INTO ${tempTable} 
            (id, karyawan_id, jenisberkas_id, keterangan, statusaktif, info, fileberkas, created_at, updated_at, modifiedby)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            item.id || null,
            item.karyawan_id,
            item.jenisberkas_id,
            item.keterangan,
            item.statusaktif,
            item.info,
            item.fileberkas,
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
              main.jenisberkas_id = temp.jenisberkas_id,
              main.keterangan = temp.keterangan,
              main.statusaktif = temp.statusaktif,
              main.info = temp.info,
              main.fileberkas = temp.fileberkas,
              main.modifiedby = temp.modifiedby,
              main.updated_at = temp.updated_at
            FROM karyawan_berkas main
            INNER JOIN ${tempTable} temp ON main.id = temp.id
            WHERE temp.id IS NOT NULL;
      `);

      const insertedDataQuery = await trx(tempTable)
        .select([
          'jenisberkas_id',
          'fileberkas',
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
        .leftJoin(`${tempTable}`, 'karyawan_berkas.id', `${tempTable}.id`)
        .whereNull(`${tempTable}.id`)
        .where('karyawan_berkas.karyawan_id', data[0]?.karyawan_id) // Ensure karyawan_id exists
        .del();

      let insertedData = null;
      if (insertedDataQuery.length > 0) {
        insertedData = await trx('karyawan_berkas')
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
      console.error('Error in createOrUpdate:', error);
      throw new Error(`Error in createOrUpdate: ${error.message}`);
    }
  }

  async findAll(karyawan_id: number) {
    const result = await dbMssql('karyawan_berkas')
      .select(
        'karyawan_berkas.id',
        'karyawan_berkas.karyawan_id',
        'karyawan_berkas.jenisberkas_id',
        'karyawan_berkas.fileberkas',
        'karyawan_berkas.keterangan',
        'karyawan_berkas.statusaktif',
        'p1.text as jenisberkas_text',
        'p2.text as statusaktif_text',
        'karyawan_berkas.info',
        dbMssql.raw(
          "FORMAT(karyawan_berkas.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
        ),
        dbMssql.raw(
          "FORMAT(karyawan_berkas.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
        ),
      )
      .where('karyawan_berkas.karyawan_id', karyawan_id)
      .leftJoin('parameter as p1', 'karyawan_berkas.jenisberkas_id', 'p1.id')
      .leftJoin('parameter as p2', 'karyawan_berkas.statusaktif', 'p2.id')
      .orderBy('karyawan_berkas.created_at', 'desc'); // Optional: Order by creation date

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
    return `This action returns a #${id} karyawanBerka`;
  }

  update(id: number, updateKaryawanBerkaDto: UpdateKaryawanBerkaDto) {
    return `This action updates a #${id} karyawanBerka`;
  }

  remove(id: number) {
    return `This action removes a #${id} karyawanBerka`;
  }
}
