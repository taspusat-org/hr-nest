import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateDaftaremailtodetailDto } from './dto/create-daftaremailtodetail.dto';
import { UpdateDaftaremailtodetailDto } from './dto/update-daftaremailtodetail.dto';
import { UtilsService } from 'src/utils/utils.service';
import { RedisService } from 'src/common/redis/redis.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { dbMssql } from 'src/common/utils/db';

@Injectable()
export class DaftaremailtodetailService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  private readonly logger = new Logger(DaftaremailtodetailService.name);
  async create(
    daftaremailtodetail: any,
    modifiedby: string,
    id: any = 0,
    trx: any = null,
  ) {
    const filteredData = daftaremailtodetail.map(
      ({ toemail, text, nama, statusaktif, ...insertData }) => insertData,
    );
    let insertedData = null;
    let data: any = null;
    const tableName = 'daftaremailtodetail';
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

    // **Pastikan setiap item di daftaremailtodetail memiliki daftaremail_id**
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
    // **Update atau Insert ke `daftaremailtodetail` dengan daftaremail_id**
    const updatedData = await trx('daftaremailtodetail')
      .join(`${tempTable}`, 'daftaremailtodetail.id', `${tempTable}.id`)
      .update({
        daftaremail_id: trx.raw(`${tempTable}.daftaremail_id`),
        toemail_id: trx.raw(`${tempTable}.toemail_id`), // This will use the `toemail_id` from the temp table
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
        'toemail_id',
        'statusaktif',
        'info',
        trx.raw('? as daftaremail_id', [id]), // **Pastikan daftaremail_id dimasukkan di sini**
        'created_at',
        'updated_at',
        trx.raw('? as modifiedby', [modifiedby]), // Ensure modifiedby is inserted
      ])
      .where(`${tempTable}.id`, '0');

    const getDeleted = await trx(tableName)
      .leftJoin(`${tempTable}`, 'daftaremailtodetail.id', `${tempTable}.id`)
      .select(
        'daftaremailtodetail.id',
        'daftaremailtodetail.daftaremail_id',
        'daftaremailtodetail.toemail_id',
        'daftaremailtodetail.statusaktif',
        'daftaremailtodetail.info',
        'daftaremailtodetail.created_at',
        'daftaremailtodetail.updated_at',
      )
      .whereNull(`${tempTable}.id`)
      .where('daftaremailtodetail.daftaremail_id', id);

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
      .leftJoin(`${tempTable}`, 'daftaremailtodetail.id', `${tempTable}.id`)
      .whereNull(`${tempTable}.id`)
      .where('daftaremailtodetail.daftaremail_id', id)
      .del();

    if (insertedDataQuery.length > 0) {
      insertedData = await trx('daftaremailtodetail')
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
    const result = await dbMssql('daftaremailtodetail')
      .select(
        'daftaremailtodetail.id',
        'daftaremailtodetail.daftaremail_id',
        'daftaremailtodetail.toemail_id',
        'daftaremailtodetail.statusaktif',
        'daftaremailtodetail.info',
        'te.email as toemail',
        'te.nama as nama',
        'p.text as text',
        dbMssql.raw(
          "FORMAT(daftaremailtodetail.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
        ),
        dbMssql.raw(
          "FORMAT(daftaremailtodetail.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
        ),
      )
      .where('daftaremailtodetail.daftaremail_id', daftaremail_id)
      .leftJoin('toemail as te', 'daftaremailtodetail.toemail_id', 'te.id')
      .leftJoin('parameter as p', 'daftaremailtodetail.statusaktif', 'p.id')
      .orderBy('daftaremailtodetail.created_at', 'desc'); // Optional: Order by creation date

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
    return `This action returns a #${id} daftaremailtodetail`;
  }

  update(
    id: number,
    updateDaftaremailtodetailDto: UpdateDaftaremailtodetailDto,
  ) {
    return `This action updates a #${id} daftaremailtodetail`;
  }

  remove(id: number) {
    return `This action removes a #${id} daftaremailtodetail`;
  }
}
