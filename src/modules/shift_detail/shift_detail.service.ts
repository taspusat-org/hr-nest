import { Injectable, Logger } from '@nestjs/common';
import { CreateShiftDetailDto } from './dto/create-shift_detail.dto';
import { UpdateShiftDetailDto } from './dto/update-shift_detail.dto';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { dbMssql } from 'src/common/utils/db';

@Injectable()
export class ShiftDetailService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  private readonly logger = new Logger(ShiftDetailService.name);
  async create(
    shiftDetailDto: any,
    modifiedby: string,
    id: any = 0,
    trx: any = null,
  ) {
    let insertedData = null;
    let data: any = null;
    const tableName = 'shift_detail';
    const dayMapping = {
      SENIN: 2,
      SELASA: 3,
      RABU: 4,
      KAMIS: 5,
      JUMAT: 6,
      SABTU: 7,
      MINGGU: 1,
    };

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

    for (data of shiftDetailDto) {
      let isDataChanged = false;

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

      // **Memetakan date_nama menjadi date_id sebelum mengecualikan date_nama**
      if (data.date_nama && dayMapping[data.date_nama.toUpperCase()]) {
        data.date_id = dayMapping[data.date_nama.toUpperCase()];
      } else {
        data.date_id = null; // Fallback jika date_nama tidak valid
        console.warn(`Invalid date_nama: ${data.date_nama}`);
      }

      // **Mengecualikan field 'date_nama' dan 'statusaktif_text'**
      const { date_nama, statusaktif_text, aksi, ...dataForInsert } = data;

      // Memasukkan data yang sudah diproses
      mainDataToInsert.push(dataForInsert);
      logData.push({
        ...data,
        created_at: time,
      });
    }

    await trx.raw(tableTemp);
    const processedData = mainDataToInsert.map((item: any) => {
      return {
        ...item,
        shift_id: item.shift_id ?? id,
        modifiedby, // Add modifiedby here
      };
    });

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

    // **Update atau Insert ke `shift_detail` dengan shift_id**
    const updatedData = await trx('shift_detail')
      .join(`${tempTable}`, 'shift_detail.id', `${tempTable}.id`)
      .update({
        shift_id: trx.raw(`${tempTable}.shift_id`),
        date_id: trx.raw(`${tempTable}.date_id`),
        jammasuk: trx.raw(`${tempTable}.jammasuk`),
        jampulang: trx.raw(`${tempTable}.jampulang`),
        batas_jammasuk: trx.raw(`${tempTable}.batas_jammasuk`),
        statusaktif: trx.raw(`${tempTable}.statusaktif`),
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
        'jammasuk',
        'jampulang',
        'batas_jammasuk',
        'statusaktif',
        'date_id',
        trx.raw('? as shift_id', [id]), // **Pastikan shift_id dimasukkan di sini**
        'created_at',
        'updated_at',
        trx.raw('? as modifiedby', [modifiedby]), // Ensure modifiedby is inserted
      ])
      .where(`${tempTable}.id`, '0');

    const getDeleted = await trx(tableName)
      .leftJoin(`${tempTable}`, 'shift_detail.id', `${tempTable}.id`)
      .select(
        'shift_detail.id',
        'shift_detail.date_id',
        'shift_detail.jammasuk',
        'shift_detail.jampulang',
        'shift_detail.batas_jammasuk',
        'shift_detail.statusaktif',
        'shift_detail.created_at',
        'shift_detail.updated_at',
        'shift_detail.shift_id',
      )
      .whereNull(`${tempTable}.id`)
      .where('shift_detail.shift_id', id);

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
      .leftJoin(`${tempTable}`, 'shift_detail.id', `${tempTable}.id`)
      .whereNull(`${tempTable}.id`)
      .where('shift_detail.shift_id', id)
      .del();

    if (insertedDataQuery.length > 0) {
      insertedData = await trx('shift_detail')
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
        postingdari: 'SHIFT HEADER',
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

  async findAll(shift_id: number) {
    // Mapping untuk mengganti date_id ke nama hari
    const dayMapping = {
      1: 'MINGGU',
      2: 'SENIN',
      3: 'SELASA',
      4: 'RABU',
      5: 'KAMIS',
      6: 'JUMAT',
      7: 'SABTU',
    };

    // Query the database for all shift_detail entries matching the given shift_id
    const result = await dbMssql('shift_detail')
      .select(
        'shift_detail.id',
        dbMssql.raw(
          'CONVERT(VARCHAR(5), shift_detail.jammasuk, 108) as jammasuk',
        ),
        dbMssql.raw(
          'CONVERT(VARCHAR(5), shift_detail.jampulang, 108) as jampulang',
        ),
        dbMssql.raw(
          'CONVERT(VARCHAR(5), shift_detail.batas_jammasuk, 108) as batas_jammasuk',
        ),
        'shift_detail.statusaktif',
        dbMssql.raw(
          "FORMAT(shift_detail.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
        ),
        dbMssql.raw(
          "FORMAT(shift_detail.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
        ),
        'shift_detail.date_id', // Add the original date_id field to map later
        'p.text as statusaktif_text',
      )
      .where('shift_detail.shift_id', shift_id)
      .leftJoin('parameter as p', 'p.id', 'shift_detail.statusaktif')
      .orderBy('shift_detail.jammasuk', 'asc'); // Optional: Order by creation date or modify as per need

    // Return the result
    if (!result.length) {
      this.logger.warn(`No Data found for ID: ${shift_id}`);
      return {
        status: false,
        message: 'No data found',
        data: [],
      };
    }

    // Map the result to include 'date_nama' field
    const mappedResult = result.map((entry: any) => ({
      ...entry,
      date_nama: dayMapping[entry.date_id] || 'Unknown', // Add the mapped 'date_nama' field
    }));

    return {
      status: true,
      message: 'ACL data fetched successfully',
      data: mappedResult,
    };
  }

  findOne(id: number) {
    return `This action returns a #${id} shiftDetail`;
  }

  update(id: number, updateShiftDetailDto: UpdateShiftDetailDto) {
    return `This action updates a #${id} shiftDetail`;
  }

  remove(id: number) {
    return `This action removes a #${id} shiftDetail`;
  }
}
