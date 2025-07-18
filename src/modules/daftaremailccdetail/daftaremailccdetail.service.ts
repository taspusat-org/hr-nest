import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateDaftaremailccdetailDto } from './dto/create-daftaremailccdetail.dto';
import { UpdateDaftaremailccdetailDto } from './dto/update-daftaremailccdetail.dto';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { UtilsService } from 'src/utils/utils.service';
import { RedisService } from 'src/common/redis/redis.service';
import { dbMssql } from 'src/common/utils/db';

@Injectable()
export class DaftaremailccdetailService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  private readonly logger = new Logger(DaftaremailccdetailService.name);
  async create(
    daftaremailccdetail: any,
    modifiedby: string,
    id: any = 0,
    trx: any = null,
  ) {
    const filteredData = daftaremailccdetail.map(
      ({ ccemail, text, nama, statusaktif, ...insertData }) => insertData,
    );
    let insertedData = null;
    let data: any = null;
    const tableName = 'daftaremailccdetail';
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

    for (data of filteredData) {
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

      const { aksi, ...dataForInsert } = data;

      mainDataToInsert.push(dataForInsert);
      logData.push({
        ...data,
        created_at: time,
      });
    }

    await trx.raw(tableTemp);

    // **Pastikan setiap item di daftaremailccdetail memiliki daftaremail_id**
    const processedData = mainDataToInsert.map((item: any) => ({
      ...item,
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
    const dataTempTable = await trx(tempTable);
    // **Update atau Insert ke `daftaremailccdetail` dengan daftaremail_id**
    const updatedData = await trx('daftaremailccdetail')
      .join(`${tempTable}`, 'daftaremailccdetail.id', `${tempTable}.id`)
      .update({
        daftaremail_id: trx.raw(`${tempTable}.daftaremail_id`),
        ccemail_id: trx.raw(`${tempTable}.ccemail_id`), // This will use the `ccemail_id` from the temp table
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
        'ccemail_id',
        'statusaktif',
        'info',
        trx.raw('? as daftaremail_id', [id]), // **Pastikan daftaremail_id dimasukkan di sini**
        'created_at',
        'updated_at',
        trx.raw('? as modifiedby', [modifiedby]), // Ensure modifiedby is inserted
      ])
      .where(`${tempTable}.id`, '0');

    const getDeleted = await trx(tableName)
      .leftJoin(`${tempTable}`, 'daftaremailccdetail.id', `${tempTable}.id`)
      .select(
        'daftaremailccdetail.id',
        'daftaremailccdetail.daftaremail_id',
        'daftaremailccdetail.ccemail_id',
        'daftaremailccdetail.statusaktif',
        'daftaremailccdetail.info',
        'daftaremailccdetail.created_at',
        'daftaremailccdetail.updated_at',
      )
      .whereNull(`${tempTable}.id`)
      .where('daftaremailccdetail.daftaremail_id', id);

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
      .leftJoin(`${tempTable}`, 'daftaremailccdetail.id', `${tempTable}.id`)
      .whereNull(`${tempTable}.id`)
      .where('daftaremailccdetail.daftaremail_id', id)
      .del();

    if (insertedDataQuery.length > 0) {
      insertedData = await trx('daftaremailccdetail')
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
        postingdari: 'DAFTAR EMAIL HEADER',
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
  async findAll(daftaremail_id: number) {
    const result = await dbMssql('daftaremailccdetail')
      .select(
        'daftaremailccdetail.id',
        'daftaremailccdetail.daftaremail_id',
        'daftaremailccdetail.ccemail_id',
        'daftaremailccdetail.statusaktif',
        'daftaremailccdetail.info',
        'te.email as ccemail',
        'te.nama as nama',
        'p.text as text',
        dbMssql.raw(
          "FORMAT(daftaremailccdetail.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
        ),
        dbMssql.raw(
          "FORMAT(daftaremailccdetail.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
        ),
      )
      .where('daftaremailccdetail.daftaremail_id', daftaremail_id)
      .leftJoin('ccemail as te', 'daftaremailccdetail.ccemail_id', 'te.id')
      .leftJoin('parameter as p', 'daftaremailccdetail.statusaktif', 'p.id')
      .orderBy('daftaremailccdetail.created_at', 'desc'); // Optional: Order by creation date

    if (!result.length) {
      this.logger.warn(`No Data found for ID: ${daftaremail_id}`);
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
    return `This action returns a #${id} daftaremailccdetail`;
  }

  update(
    id: number,
    updateDaftaremailccdetailDto: UpdateDaftaremailccdetailDto,
  ) {
    return `This action updates a #${id} daftaremailccdetail`;
  }

  remove(id: number) {
    return `This action removes a #${id} daftaremailccdetail`;
  }
}
