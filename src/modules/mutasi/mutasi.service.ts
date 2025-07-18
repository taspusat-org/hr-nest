import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMutasiDto } from './dto/create-mutasi.dto';
import { UpdateMutasiDto } from './dto/update-mutasi.dto';
import { RedisService } from 'src/common/redis/redis.service';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { dbMssql } from 'src/common/utils/db';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { Workbook } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
@Injectable()
export class MutasiService {
  private readonly tableName: string = 'mutasi';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  async create(data: any, trx: any, modifiedby: any) {
    try {
      data.updated_at = this.utilsService.getTime();
      data.created_at = this.utilsService.getTime();
      data.modifiedby = modifiedby;
      const insertedItems = await trx(this.tableName)
        .insert(data)
        .returning('*');

      const newItem = insertedItems[0];

      const itemsPerPage = 30;

      const itemIndex = await trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'k.namakaryawan as karyawan_nama',
          'u.statusaktif',
          'u.karyawan_id',
          'u.modifiedby',
          'u.info',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
        ])
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .orderBy('karyawan_nama')
        .where('u.id', '<=', newItem.id)
        .then((result) => result.findIndex((item) => item.id === newItem.id));

      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;
      const endIndex = pageNumber * itemsPerPage;

      const limitedItems = await trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'k.namakaryawan as karyawan_nama',
          'c1.nama as namacabang_lama',
          'c2.nama as namacabang_baru',
          'j2.nama as namajabatan_baru',
          'j1.nama as namajabatan_lama',
          'u.statusaktif',
          'u.karyawan_id',
          'u.modifiedby',
          'k.email as lookupKaryawan',
          'u.info',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c1', 'u.cabanglama_id', 'c1.id')
        .leftJoin('cabang as c2', 'u.cabangbaru_id', 'c2.id')
        .leftJoin('jabatan as j1', 'u.jabatanlama_id', 'j1.id')
        .leftJoin('jabatan as j2', 'u.jabatanbaru_id', 'j2.id')
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .orderBy('karyawan_nama')
        .limit(endIndex);

      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD ERROR',
          idtrans: newItem.id,
          nobuktitrans: newItem.id,
          aksi: 'ADD',
          datajson: JSON.stringify(newItem),
          modifiedby: modifiedby,
        },
        trx,
      );
      return {
        newItem,
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      throw new Error(`Error creating menu: ${error.message}`);
    }
  }

  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;

      page = page ?? 1;
      limit = limit ?? 0;

      const offset = (page - 1) * limit;

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'k.namakaryawan as karyawan_nama',
          'c1.nama as namacabang_lama',
          'c2.nama as namacabang_baru',
          'j2.nama as namajabatan_baru',
          'j1.nama as namajabatan_lama',
          'u.statusaktif',
          'u.karyawan_id',
          'u.cabanglama_id',
          'u.cabangbaru_id',
          'u.jabatanlama_id',
          'u.jabatanbaru_id',
          'u.tglmutasi',
          'u.modifiedby',
          'u.info',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c1', 'u.cabanglama_id', 'c1.id')
        .leftJoin('cabang as c2', 'u.cabangbaru_id', 'c2.id')
        .leftJoin('jabatan as j1', 'u.jabatanlama_id', 'j1.id')
        .leftJoin('jabatan as j2', 'u.jabatanbaru_id', 'j2.id')
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id');

      if (limit > 0) {
        const offset = (page - 1) * limit;
        query.limit(limit).offset(offset);
      }

      if (search) {
        query.where((builder) => {
          builder
            .orWhere('namacabang_lama', 'like', `%${search}%`)
            .orWhere('keterangan', 'like', `%${search}%`)

            .orWhere('p.memo', 'like', `%${search}%`)

            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      if (sort?.sortBy && sort?.sortDirection) {
        query.orderBy(sort.sortBy, sort.sortDirection);
      }

      const result = await dbMssql(this.tableName).count('id as total').first();
      const total = result?.total ? Number(result.total) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

      const data = await query;
      return {
        data,
        total,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalItems: total,
          itemsPerPage: limit > 0 ? limit : total,
        },
      };
    } catch (error) {
      console.error('Error fetching errors:', error);
      throw new Error(error);
    }
  }
  async findAllByIds(ids: { id: number }[]) {
    try {
      const idList = ids.map((item) => item.id);
      const tempData = `##temp_${Math.random().toString(36).substring(2, 15)}`;

      const createTempTableQuery = `
        CREATE TABLE ${tempData} (
          id INT
        );
      `;
      await dbMssql.raw(createTempTableQuery);

      const insertTempTableQuery = `
        INSERT INTO ${tempData} (id)
        VALUES ${idList.map((id) => `(${id})`).join(', ')};
      `;
      await dbMssql.raw(insertTempTableQuery);

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'k.namakaryawan as karyawan_nama',
          'c1.nama as namacabang_lama',
          'c2.nama as namacabang_baru',
          'j2.nama as namajabatan_baru',
          'j1.nama as namajabatan_lama',
          'u.statusaktif',
          'u.karyawan_id',
          'u.cabanglama_id',
          'u.cabangbaru_id',
          'u.jabatanlama_id',
          'u.jabatanbaru_id',
          'u.tglmutasi',
          'u.modifiedby',
          'u.info',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c1', 'u.cabanglama_id', 'c1.id')
        .leftJoin('cabang as c2', 'u.cabangbaru_id', 'c2.id')
        .leftJoin('jabatan as j1', 'u.jabatanlama_id', 'j1.id')
        .leftJoin('jabatan as j2', 'u.jabatanbaru_id', 'j2.id')
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'u.id', 'temp.id')

        .orderBy('karyawan_nama', 'ASC');

      const data = await query;

      const dropTempTableQuery = `DROP TABLE ${tempData};`;
      await dbMssql.raw(dropTempTableQuery);

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }

  async getById(id: number, trx: any) {
    try {
      const result = await trx(this.tableName).where('id', id).first();

      if (!result) {
        throw new Error('Data not found');
      }

      return result;
    } catch (error) {
      console.error('Error fetching data by id:', error);
      throw new Error('Failed to fetch data by id');
    }
  }

  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:I1');
    worksheet.mergeCells('A2:I2');
    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN DAFTAR KARYAWAN';
    worksheet.getCell('A3').value = 'Data Export';
    worksheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A2').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A3').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A1').font = { size: 14, bold: true };
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('A3').font = { bold: true };

    // Adjust headers to match JSON structure
    const headers = [
      'NO.',
      'KARYAWAN NAMA',
      'CABANG LAMA',
      'CABANG BARU',
      'JABATAN LAMA',
      'JABATAN BARU',
      'STATUS AKTIF',
      'TANGGAL MUTASI',
      'INFO',
    ];
    headers.forEach((header, index) => {
      const cell = worksheet.getCell(5, index + 1);
      cell.value = header;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF00' },
      };
      cell.font = { bold: true, name: 'Tahoma', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Adjust data mapping based on the JSON fields
    data.forEach((row, rowIndex) => {
      const currentRow = rowIndex + 6;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1; // NO.
      worksheet.getCell(currentRow, 2).value = row.karyawan_nama; // KARYAWAN NAMA
      worksheet.getCell(currentRow, 3).value = row.namacabang_lama; // CABANG LAMA
      worksheet.getCell(currentRow, 4).value = row.namacabang_baru; // CABANG BARU
      worksheet.getCell(currentRow, 5).value = row.namajabatan_lama; // JABATAN LAMA
      worksheet.getCell(currentRow, 6).value = row.namajabatan_baru; // JABATAN BARU
      worksheet.getCell(currentRow, 7).value = row.statusaktif
        ? 'Aktif'
        : 'Tidak Aktif'; // STATUS AKTIF
      worksheet.getCell(currentRow, 8).value = new Date(
        row.tglmutasi,
      ).toLocaleDateString(); // TANGGAL MUTASI
      worksheet.getCell(currentRow, 9).value = row.info; // INFO

      for (let col = 1; col <= headers.length; col++) {
        const cell = worksheet.getCell(currentRow, col);
        cell.font = { name: 'Tahoma', size: 10 };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });

    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 30;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_karyawan_Mutasi_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  async update(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();

      if (!existingData) {
        throw new Error('Menu not found');
      }

      // Convert tglmutasi data to ISO string if it is in string format
      if (typeof data.tglmutasi === 'string') {
        data.tglmutasi = new Date(data.tglmutasi).toISOString();
      }

      if (existingData.tglmutasi instanceof Date) {
        existingData.tglmutasi = existingData.tglmutasi.toISOString();
      }

      const hasChanges = this.utilsService.hasChanges(data, existingData);
      if (hasChanges) {
        data.updated_at = this.utilsService.getTime();

        await trx(this.tableName).where('id', id).update(data);
      }

      const itemsPerPage = 30;

      const allItems = await trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'k.namakaryawan as karyawan_nama',
          'c1.nama as namacabang_lama',
          'c2.nama as namacabang_baru',
          'j2.nama as namajabatan_baru',
          'j1.nama as namajabatan_lama',
          'u.statusaktif',
          'u.karyawan_id',
          'u.modifiedby',
          'k.email as lookupKaryawan',
          'u.info',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c1', 'u.cabanglama_id', 'c1.id')
        .leftJoin('cabang as c2', 'u.cabangbaru_id', 'c2.id')
        .leftJoin('jabatan as j1', 'u.jabatanlama_id', 'j1.id')
        .leftJoin('jabatan as j2', 'u.jabatanbaru_id', 'j2.id')
        .leftJoin('karyawan as k', 'u.karyawan_id', 'k.id')
        .orderBy('karyawan_nama');

      const itemIndex = allItems.findIndex((item) => item.id === id);

      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;

      const endIndex = pageNumber * itemsPerPage;

      const limitedItems = allItems.slice(0, endIndex);

      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT DAFTAR EMAIL',
          idtrans: id,
          nobuktitrans: id,
          aksi: 'EDIT',
          datajson: JSON.stringify(data),
          modifiedby: data.modifiedby,
        },
        trx,
      );
      return {
        newItem: {
          id,
          ...data,
        },
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      console.error('Error updating parameter:', error);
      throw new Error('Failed to update parameter');
    }
  }

  async delete(id: number, trx: any, modifiedby: string) {
    try {
      const deletedData = await this.utilsService.lockAndDestroy(
        id,
        this.tableName,
        'id',
        trx,
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'DELETE DAFTAR EMAIL',
          idtrans: deletedData.id,
          nobuktitrans: deletedData.id,
          aksi: 'DELETE',
          datajson: JSON.stringify(deletedData),
          modifiedby: modifiedby,
        },
        trx,
      );

      return { status: 200, message: 'Data deleted successfully', deletedData };
    } catch (error) {
      console.error('Error deleting data:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete data');
    }
  }
}
