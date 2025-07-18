import { Injectable, Logger } from '@nestjs/common';
import { CreateKaryawanPengalamankerjaDto } from './dto/create-karyawan_pengalamankerja.dto';
import { UpdateKaryawanPengalamankerjaDto } from './dto/update-karyawan_pengalamankerja.dto';
import { dbMssql } from 'src/common/utils/db';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';

@Injectable()
export class KaryawanPengalamankerjaService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  private readonly logger = new Logger(KaryawanPengalamankerjaService.name);
  async create(
    karyawanNomorDaruratData: any,
    modifiedby: string,
    id: any = 0,
    trx: any = null,
  ) {
    let insertedData = null;
    let data: any = null;
    const tableName = 'karyawan_pengalamankerja';
    const tempTable = `##temp_${Math.random().toString(36).substring(2, 15)}`;

    const result = await trx(tableName).columnInfo();
    const tableTemp = await this.utilsService.createTempTable(
      tableName,
      trx,
      tempTable,
    );

    const time = this.utilsService.getTime();
    const logData: any[] = [];
    const mainDataToInsert: any[] = [];
    if (
      !karyawanNomorDaruratData ||
      karyawanNomorDaruratData === undefined ||
      karyawanNomorDaruratData?.length === 0
    ) {
      // If data is empty, delete the relevant records from the database
      const deletedData = await trx(tableName)
        .where('karyawan_pengalamankerja.karyawan_id', id)
        .del();
      return { success: true, message: 'success delete all data' };
    }
    for (data of karyawanNomorDaruratData) {
      let isDataChanged = false;
      if (!data.tglmulai || data.tglmulai === '') {
        data.tglmulai = null;
      } else if (typeof data.tglmulai === 'string') {
        const [day, month, year] = data.tglmulai.split('-');
        data.tglmulai = `${year}-${month}-${day}`;
      }
      if (!data.tglakhir || data.tglakhir === '') {
        data.tglakhir = null;
      } else if (typeof data.tglakhir === 'string') {
        const [day, month, year] = data.tglakhir.split('-');
        data.tglakhir = `${year}-${month}-${day}`;
      }
      // Check if the data has an id (existing record)
      if (data.id) {
        const existingData = await trx(tableName).where('id', data.id).first();

        if (existingData) {
          const createdAt = {
            created_at: existingData.created_at,
            updated_at: existingData.updated_at,
          };
          Object.assign(data, createdAt);

          if (this.utilsService.hasChanges(data, existingData)) {
            data.updated_at = time;
            isDataChanged = true;
            data.aksi = 'UPDATE';
          }
        }
      } else {
        const newTimestamps = {
          created_at: time,
          updated_at: time,
        };
        Object.assign(data, newTimestamps);
        isDataChanged = true;
        data.aksi = 'CREATE';
      }

      if (!isDataChanged) {
        data.aksi = 'NO UPDATE';
      }

      const { aksi, statusaktif_text, ...dataForInsert } = data;

      mainDataToInsert.push(dataForInsert);
      logData.push({
        ...data,
        created_at: time,
      });
    }

    await trx.raw(tableTemp);

    // **Pastikan setiap item di karyawanNomorDaruratData memiliki karyawan_id**
    const processedData = mainDataToInsert.map((item: any) => ({
      ...item,
      karyawan_id: item.karyawan_id ?? id,
      modifiedby, // Add modifiedby here
    }));

    const jsonString = JSON.stringify(processedData);
    const mappingData = Object.keys(processedData[0]).map((key) => [
      'value',
      `$.${key}`,
      key,
    ]);

    const openJson = await dbMssql
      .from(trx.raw('OPENJSON(?)', [jsonString]))
      .jsonExtract(mappingData)
      .as('jsonData');

    await trx(tempTable).insert(openJson);

    // **Update atau Insert ke `karyawan_pengalamankerja` dengan karyawan_id**
    const updatedData = await trx('karyawan_pengalamankerja')
      .join(`${tempTable}`, 'karyawan_pengalamankerja.id', `${tempTable}.id`)
      .update({
        namaperusahaan: trx.raw(`${tempTable}.namaperusahaan`),
        karyawan_id: trx.raw(`${tempTable}.karyawan_id`),
        jabatan: trx.raw(`${tempTable}.jabatan`),
        tglmulai: trx.raw(`${tempTable}.tglmulai`),
        tglakhir: trx.raw(`${tempTable}.tglakhir`),
        keterangan: trx.raw(`${tempTable}.keterangan`),
        statusaktif: trx.raw(`${tempTable}.statusaktif`),
        info: trx.raw(`${tempTable}.info`),
        created_at: trx.raw(`${tempTable}.created_at`),
        updated_at: trx.raw(`${tempTable}.updated_at`),
        modifiedby: trx.raw(`${tempTable}.modifiedby`), // Update the modifiedby field
      })
      .returning('*')
      .then((result: any) => result[0])
      .catch((error: any) => {
        console.error('Error inserting data:', error);
        throw error;
      });

    // Handle insertion jika tidak ada update
    const insertedDataQuery = await trx(tempTable)
      .select([
        'namaperusahaan',
        'jabatan',
        'tglmulai',
        'tglakhir',
        'keterangan',
        'statusaktif',
        'info',
        trx.raw('? as karyawan_id', [id]), // **Pastikan karyawan_id dimasukkan di sini**
        'created_at',
        'updated_at',
        trx.raw('? as modifiedby', [modifiedby]), // Ensure modifiedby is inserted
      ])
      .where(`${tempTable}.id`, '0');

    const getDeleted = await trx(tableName)
      .leftJoin(
        `${tempTable}`,
        'karyawan_pengalamankerja.id',
        `${tempTable}.id`,
      )
      .select(
        'karyawan_pengalamankerja.id',
        'karyawan_pengalamankerja.namaperusahaan',
        'karyawan_pengalamankerja.jabatan',
        'karyawan_pengalamankerja.tglmulai',
        'karyawan_pengalamankerja.tglakhir',
        'karyawan_pengalamankerja.keterangan',
        'karyawan_pengalamankerja.statusaktif',
        'karyawan_pengalamankerja.info',
        'karyawan_pengalamankerja.created_at',
        'karyawan_pengalamankerja.updated_at',
        'karyawan_pengalamankerja.karyawan_id',
      )
      .whereNull(`${tempTable}.id`)
      .where('karyawan_pengalamankerja.karyawan_id', id);

    let pushToLog: any[] = [];

    if (getDeleted.length > 0) {
      pushToLog = Object.assign(getDeleted, { aksi: 'DELETE' });
    }

    const pushToLogWithAction = pushToLog.map((entry) => ({
      ...entry,
      aksi: 'DELETE',
    }));

    const finalData = logData.concat(pushToLogWithAction);

    const deletedData = await trx(tableName)
      .leftJoin(
        `${tempTable}`,
        'karyawan_pengalamankerja.id',
        `${tempTable}.id`,
      )
      .whereNull(`${tempTable}.id`)
      .where('karyawan_pengalamankerja.karyawan_id', id)
      .del();

    if (insertedDataQuery.length > 0) {
      insertedData = await trx('karyawan_pengalamankerja')
        .insert(insertedDataQuery)
        .returning('*')
        .then((result: any) => result[0])
        .catch((error: any) => {
          console.error('Error inserting data:', error);
          throw error;
        });
    }

    await this.logTrailService.create(
      {
        namatabel: tableName,
        postingdari: 'KARYAWAN HEADER',
        idtrans: id,
        nobuktitrans: id,
        aksi: 'EDIT',
        datajson: JSON.stringify(finalData),
        modifiedby: modifiedby, // Example modifiedby for logging
      },
      trx,
    );

    return updatedData || insertedData;
  }

  async findAll(karyawan_id: number) {
    const result = await dbMssql('karyawan_pengalamankerja')
      .select(
        'karyawan_pengalamankerja.id',
        'karyawan_pengalamankerja.karyawan_id',
        'karyawan_pengalamankerja.namaperusahaan',
        'karyawan_pengalamankerja.jabatan',
        dbMssql.raw(
          "FORMAT(karyawan_pengalamankerja.tglmulai, 'dd-MM-yyyy') as tglmulai",
        ),
        dbMssql.raw(
          "FORMAT(karyawan_pengalamankerja.tglakhir, 'dd-MM-yyyy') as tglakhir",
        ),
        'p.text as statusaktif_text',
        'karyawan_pengalamankerja.keterangan',
        'karyawan_pengalamankerja.statusaktif',
        'karyawan_pengalamankerja.info',
        dbMssql.raw(
          "FORMAT(karyawan_pengalamankerja.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
        ),
        dbMssql.raw(
          "FORMAT(karyawan_pengalamankerja.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
        ),
      )
      .leftJoin(
        'parameter as p',
        'p.id',
        'karyawan_pengalamankerja.statusaktif',
      )
      .where('karyawan_pengalamankerja.karyawan_id', karyawan_id)
      .orderBy('karyawan_pengalamankerja.created_at', 'desc'); // Optional: Order by creation date

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
    return `This action returns a #${id} karyawanPengalamankerja`;
  }

  update(
    id: number,
    updateKaryawanPengalamankerjaDto: UpdateKaryawanPengalamankerjaDto,
  ) {
    return `This action updates a #${id} karyawanPengalamankerja`;
  }

  remove(id: number) {
    return `This action removes a #${id} karyawanPengalamankerja`;
  }
}
