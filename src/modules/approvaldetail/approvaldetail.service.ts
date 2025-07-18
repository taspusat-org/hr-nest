import { Injectable } from '@nestjs/common';
import { CreateApprovaldetailDto } from './dto/create-approvaldetail.dto';
import { UpdateApprovaldetailDto } from './dto/update-approvaldetail.dto';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { dbMssql } from 'src/common/utils/db';

@Injectable()
export class ApprovaldetailService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  async create(
    createApprovalDetailDto: any,
    id: any = 0,
    trx: any = null,
    modifiedby: string,
  ) {
    let insertedData = null;
    let data: any = null;
    const tableName = 'approvaldetail';
    const tempApprovalDetail = `##temp_${Math.random().toString(36).substring(2, 15)}`;

    const result = await trx(tableName).columnInfo();
    const tableTemp = await this.utilsService.createTempTable(
      tableName,
      trx,
      tempApprovalDetail,
    );

    const time = this.utilsService.getTime();
    const hasChanges = this.utilsService.hasChanges;
    const logData: any[] = [];
    const mainDataToInsert: any[] = [];

    for (data of createApprovalDetailDto) {
      let isDataChanged = false;

      // Check if the data has an id (existing record)
      if (data.id) {
        const existingData = await trx(tableName).where('id', data.id).first();

        if (existingData) {
          const createdAt = {
            created_at: existingData.created_at,
            updated_at: existingData.updated_at,
            modifiedby: modifiedby, // Include modifiedby when updating
          };
          Object.assign(data, createdAt);

          if (this.utilsService.hasChanges(data, existingData)) {
            data.updated_at = time;
            isDataChanged = true;
            data.aksi = 'UPDATE';
            data.modifiedby = modifiedby; // Ensure modifiedby is added for update
          }
        }
      } else {
        const newTimestamps = {
          created_at: time,
          updated_at: time,
          modifiedby: modifiedby, // Include modifiedby when creating
        };
        Object.assign(data, newTimestamps);
        data.modifiedby = modifiedby; // Ensure modifiedby is added for new creation
        isDataChanged = true;
        data.aksi = 'CREATE';
      }

      if (!isDataChanged) {
        data.aksi = 'NO UPDATE';
      }

      const { aksi, namakaryawan, ...dataForInsert } = data;
      mainDataToInsert.push(dataForInsert);
      logData.push({
        ...data,
        created_at: time,
        modifiedby: modifiedby, // Log modifiedby
      });
    }

    await trx.raw(tableTemp);

    // **Ensure every item in createApprovalDetailDto has approval_id**
    const processedData = mainDataToInsert.map((item: any) => ({
      ...item,
      approval_id: item.approval_id ?? id, // Map approval_id to the id if not provided
      modifiedby: modifiedby, // Include modifiedby in the processed data
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

    await trx(tempApprovalDetail).insert(openJson);

    const updatedData = await trx('approvaldetail')
      .join(
        `${tempApprovalDetail}`,
        'approvaldetail.id',
        `${tempApprovalDetail}.id`,
      )
      .update({
        approval_id: trx.raw(`${tempApprovalDetail}.approval_id`),
        karyawan_id: trx.raw(`${tempApprovalDetail}.karyawan_id`),
        jenjangapproval: trx.raw(`${tempApprovalDetail}.jenjangapproval`),
        info: trx.raw(`${tempApprovalDetail}.info`),
        modifiedby: trx.raw(`'${modifiedby}'`), // Make sure modifiedby is included in update

        created_at: trx.raw(`${tempApprovalDetail}.created_at`),
        updated_at: trx.raw(`${tempApprovalDetail}.updated_at`),
      })
      .returning('*')
      .then((result: any) => {
        return result[0];
      })
      .catch((error: any) => {
        console.error('Error inserting data:', error);
        throw error;
      });

    // Handle insertion if no update
    const insertedDataQuery = await trx(tempApprovalDetail)
      .select([
        'karyawan_id',
        'jenjangapproval',
        'info',
        'modifiedby', // Include modifiedby in the insert query
        trx.raw('? as approval_id', [id]),
        'created_at',
        'updated_at',
      ])
      .where(`${tempApprovalDetail}.id`, '0');

    const getDeleted = await trx(tableName)
      .leftJoin(
        `${tempApprovalDetail}`,
        'approvaldetail.id',
        `${tempApprovalDetail}.id`,
      )
      .select(
        'approvaldetail.id',
        'approvaldetail.approval_id',
        'approvaldetail.karyawan_id',
        'approvaldetail.jenjangapproval',
        'approvaldetail.info',
        'approvaldetail.modifiedby',
        'approvaldetail.created_at',
        'approvaldetail.updated_at',
      )
      .whereNull(`${tempApprovalDetail}.id`)
      .where('approvaldetail.approval_id', id);

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
        `${tempApprovalDetail}`,
        'approvaldetail.id',
        `${tempApprovalDetail}.id`,
      )
      .whereNull(`${tempApprovalDetail}.id`)
      .where('approvaldetail.approval_id', id)
      .del();

    if (insertedDataQuery.length > 0) {
      insertedData = await trx('approvaldetail')
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
        postingdari: 'APPROVAL HEADER',
        idtrans: id,
        nobuktitrans: id,
        aksi: 'EDIT',
        datajson: JSON.stringify(finalData),
        modifiedby: modifiedby, // Ensure modifiedby is logged
      },
      trx,
    );

    return updatedData || insertedData;
  }

  async findById(id: number, trx: any) {
    const tableName = 'approvaldetail';
    try {
      const approvalDetail = await trx(`${tableName} as c`)
        .select([
          'c.id as id',
          'c.karyawan_id',
          'c.jenjangapproval',
          'c.info',
          'c.modifiedby',
          'k.namakaryawan as namakaryawan',
          trx.raw("FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        ])
        .leftJoin('karyawan as k', 'c.karyawan_id', 'k.id')
        .where('c.approval_id', id);
      return approvalDetail;
    } catch (error) {
      console.error('Error fetching cuti details:', error);
      throw error;
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} approvaldetail`;
  }

  update(id: number, updateApprovaldetailDto: UpdateApprovaldetailDto) {
    return `This action updates a #${id} approvaldetail`;
  }

  remove(id: number) {
    return `This action removes a #${id} approvaldetail`;
  }
}
