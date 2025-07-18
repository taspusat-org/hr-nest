import { Injectable } from '@nestjs/common';
import { CreateCutidetailDto } from './dto/create-cutidetail.dto';
import { UpdateCutidetailDto } from './dto/update-cutidetail.dto';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { dbMssql } from 'src/common/utils/db';
import { KaryawanService } from '../karyawan/karyawan.service';

@Injectable()
export class CutidetailService {
  constructor(
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
    private readonly karyawanService: KaryawanService, // Assuming you have a KaryawanService to fetch employee data
  ) {}

  async create(
    cutiDetail: any,
    id: any = 0,
    karyawan_id: any,
    trx: any = null,
    modifiedby: any,
  ) {
    let insertedData = null;
    let data: any = null;
    const tableName = 'cutidetail';
    const tempCutiDetail = `##temp_${Math.random().toString(36).substring(2, 15)}`;
    const result = await trx(tableName).columnInfo();
    const tableTemp = await this.utilsService.createTempTable(
      tableName,
      trx,
      tempCutiDetail,
    );
    const time = this.utilsService.getTime();
    const hasChanges = this.utilsService.hasChanges;
    const logData: any[] = [];
    const mainDataToInsert: any[] = [];

    for (data of cutiDetail) {
      let isDataChanged = false;

      // Check if the data has an id (existing record)
      if (data.id != 0) {
        const existingData = await trx(tableName).where('id', data.id).first();
        if (existingData) {
          const createdAt = {
            created_at: existingData.created_at,
            updated_at: existingData.updated_at,
            modifiedby: modifiedby,
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
          modifiedby: modifiedby,
        };
        Object.assign(data, newTimestamps);
        isDataChanged = true;
        data.aksi = 'CREATE';
      }

      if (!isDataChanged) {
        data.aksi = 'NO UPDATE';
      }
      const { aksi, ...dataForInsert } = data;

      const dataKaryawan = await this.karyawanService.findById(
        karyawan_id,
        trx,
      );
      const tglMasukKerja = dataKaryawan ? dataKaryawan.tglmasukkerja : null;
      if (
        dataKaryawan &&
        (dataKaryawan.cabang_id == 28 ||
          dataKaryawan.cabang_id == 29 ||
          dataKaryawan.cabang_id == 1135)
      ) {
        const tglCutiYear = new Date(data.tglcuti).getFullYear();
        const [day, month, year] = tglMasukKerja.split('-');
        // Correct the date creation using Date.UTC
        const tglMasukKerjaDate = new Date(Date.UTC(year, month - 1, day)); // month - 1 because JavaScript months are zero-based
        // Adjust tglMasukKerja to the year of tglcuti (new object to avoid mutation)
        let tglMasukKerjaAdjusted = new Date(
          tglMasukKerjaDate.setFullYear(tglCutiYear),
        );
        // If the anniversary (tglMasukKerjaAdjusted) is after tglcuti, then adjust the anniversary to the previous year
        if (tglMasukKerjaAdjusted > new Date(data.tglcuti)) {
          // Ensure we are creating a new Date object for the adjusted date
          tglMasukKerjaAdjusted = new Date(
            tglMasukKerjaAdjusted.setFullYear(
              tglMasukKerjaAdjusted.getFullYear() - 1,
            ),
          );
        }
        dataForInsert.periodecutidari = new Date(tglMasukKerjaAdjusted);
        // Set periodecutisampai to 1 year after periodecutidari, then subtract 1 day
        const periodetglsampai = new Date(tglMasukKerjaAdjusted);
        periodetglsampai.setFullYear(periodetglsampai.getFullYear() + 1); // Add 1 year
        periodetglsampai.setDate(periodetglsampai.getDate() - 1); // Subtract 1 day
        dataForInsert.periodecutisampai = periodetglsampai;
      } else {
        // For other branches:
        const tglCutiYear = new Date(data.tglcuti).getFullYear();
        dataForInsert.periodecutidari = new Date(`${tglCutiYear}-01-01`);
        dataForInsert.periodecutisampai = new Date(`${tglCutiYear}-12-31`);
      }

      // Add the processed data to the main insert array
      mainDataToInsert.push(dataForInsert);
      logData.push({
        ...data,
        created_at: time,
        modifiedby: modifiedby,
      });
    }

    await trx.raw(tableTemp);

    // **Ensure each item in cutiDetail has cuti_id and modifiedby**
    const processedData = mainDataToInsert.map((item: any) => ({
      ...item,
      cuti_id: item.cuti_id ?? id,
      modifiedby: modifiedby,
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

    // Insert into the temporary table
    await trx(tempCutiDetail).insert(openJson);

    // **Update or Insert into `cutidetail` with cuti_id and modifiedby**
    const updatedData = await trx('cutidetail')
      .join(`${tempCutiDetail}`, 'cutidetail.id', `${tempCutiDetail}.id`)
      .update({
        tglcuti: trx.raw(`${tempCutiDetail}.tglcuti`),
        created_at: trx.raw(`${tempCutiDetail}.created_at`),
        periodecutidari: trx.raw(`${tempCutiDetail}.periodecutidari`),
        periodecutisampai: trx.raw(`${tempCutiDetail}.periodecutisampai`),
        updated_at: trx.raw(`${tempCutiDetail}.updated_at`),
        modifiedby: trx.raw(`'${modifiedby}'`),
      })
      .returning('*')
      .then((result: any) => result[0])
      .catch((error: any) => {
        console.error('Error inserting data:', error);
        throw error;
      });

    const deletedData = await trx(tableName)
      .leftJoin(`${tempCutiDetail}`, 'cutidetail.id', `${tempCutiDetail}.id`)
      .whereNull(`${tempCutiDetail}.id`)
      .where('cutidetail.cuti_id', id)
      .del();

    // Handle insertion if no update
    // Pastikan kita insert data yang valid (ID = 0)
    const insertedDataQuery = await trx(tempCutiDetail)
      .select([
        'tglcuti',
        trx.raw('? as cuti_id', [id]), // Pastikan cuti_id menggunakan ID yang valid
        'periodecutidari',
        'periodecutisampai',
        'created_at',
        'updated_at',
        'modifiedby',
      ])
      .where(`${tempCutiDetail}.id`, '0'); // Filter untuk ID yang 0

    if (insertedDataQuery.length > 0) {
      // Pastikan kita menggunakan tipe data yang sesuai (id menjadi integer jika diperlukan)
      insertedDataQuery.forEach((data: any) => {
        // Konversi `cuti_id` menjadi integer jika diperlukan
        data.cuti_id = parseInt(data.cuti_id, 10); // Pastikan cuti_id adalah integer

        // Jika ada kolom lain yang perlu diubah atau diproses, lakukan disini
      });

      // Insert ke tabel cutidetail
      insertedData = await trx('cutidetail')
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
        postingdari: 'CUTI HEADER',
        idtrans: id,
        nobuktitrans: 'TES 123',
        aksi: 'EDIT',
        datajson: JSON.stringify(logData),
        modifiedby: modifiedby,
      },
      trx,
    );

    return updatedData || insertedData;
  }

  async findByCutiId(cutiId: number, trx: any) {
    const tableName = 'cutidetail';
    try {
      const cutiDetails = await trx(tableName)
        .select([
          'id',
          trx.raw("FORMAT(tglcuti, 'dd-MM-yyyy') as tglcuti"),
          'modifiedby',
          trx.raw("FORMAT(created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(created_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
        ])
        .where('cuti_id', cutiId);
      return cutiDetails;
    } catch (error) {
      console.error('Error fetching cuti details:', error);
      throw error;
    }
  }
  findAll() {
    return `This action returns all cutidetail`;
  }

  findOne(id: number) {
    return `This action returns a #${id} cutidetail`;
  }

  update(id: number, updateCutidetailDto: UpdateCutidetailDto) {
    return `This action updates a #${id} cutidetail`;
  }

  remove(id: number) {
    return `This action removes a #${id} cutidetail`;
  }
}
