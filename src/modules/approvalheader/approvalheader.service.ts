import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ApprovaldetailService } from '../approvaldetail/approvaldetail.service';
import { UtilsService } from 'src/utils/utils.service';
import { RedisService } from 'src/common/redis/redis.service';
import * as fs from 'fs';
import * as path from 'path';
import { Workbook } from 'exceljs';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { dbMssql } from 'src/common/utils/db';
import { FindAllParams } from 'src/common/interfaces/all.interface';

@Injectable()
export class ApprovalheaderService {
  private readonly tableName = 'approvalheader';
  constructor(
    private readonly utilsService: UtilsService,
    private readonly redisService: RedisService,
    private readonly logTrailService: LogtrailService,
  ) {}

  async create(data: any, trx: any, modifiedby: any) {
    try {
      data.updated_at = this.utilsService.getTime();
      data.created_at = this.utilsService.getTime();
      data.modifiedby = modifiedby;
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        cabang_nama,
        ...insertData
      } = data;
      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
        }
      });
      let rawFilters: Record<string, any> = {};
      if (filters) {
        if (typeof filters === 'string') {
          try {
            rawFilters = JSON.parse(filters);
          } catch (err) {
            console.error('Gagal parse filters:', err);
            rawFilters = {};
          }
        } else {
          rawFilters = { ...filters };
        }
      }

      // 2. Paksa selalu ada karyawan_id di filterObj
      rawFilters.cabang_id = data.cabang_id;

      // 3. Gunakan filterObj di query nanti
      const filterObj = rawFilters;
      const insertedItems = await trx(this.tableName)
        .insert(insertData)
        .returning('*');

      const newItem = insertedItems[0];
      const query = trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.nama',
          'u.keterangan',
          'u.cabang_id',
          'u.statusaktif',
          'u.info',
          'u.modifiedby',
          trx.raw("FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
          'p.memo',
          'p.text',
          'c.nama as cabang_nama',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c', 'u.cabang_id', 'c.id')
        .orderBy(sortBy ? `u.${sortBy}` : 'u.id', sortDirection || 'desc')
        .where('u.id', '<=', newItem.id);
      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
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
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('u.nama', 'like', `%${search}%`)
            .orWhere('u.keterangan', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      // Ambil hasil query yang terfilter
      const filteredItems = await query;
      let itemIndex = filteredItems.findIndex((item) => item.id === newItem.id);

      if (itemIndex === -1) {
        itemIndex = 0;
      }

      const pageNumber = Math.floor(itemIndex / limit) + 1;
      const endIndex = pageNumber * limit;

      // Ambil data hingga halaman yang mencakup item baru
      const limitedItems = filteredItems.slice(0, endIndex);

      // Simpan ke Redis
      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD APPROVAL HEADER',
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
      limit = limit ?? 10; // Default to 10 if limit is not provided

      const offset = (page - 1) * limit;

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.nama',
          'u.keterangan',
          'u.cabang_id',
          'u.statusaktif',
          'u.info',
          'u.modifiedby',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
          'c.nama as cabang_nama',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c', 'u.cabang_id', 'c.id');

      // Apply search filter
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('u.nama', 'like', `%${search}%`)
            .orWhere('u.keterangan', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      // Apply filters
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'memo' || key === 'text') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      // Apply sorting
      if (sort?.sortBy && sort?.sortDirection) {
        query.orderBy(sort.sortBy, sort.sortDirection);
      }

      // Get the total count
      const result = await dbMssql('approvalheader')
        .count('id as total')
        .first();
      const total = result?.total ? Number(result.total) : 0;
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

      // Apply pagination
      const data = await query.limit(limit).offset(offset);

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
      console.error('Error fetching data:', error);
      throw new Error('Error fetching data');
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} approvalheader`;
  }

  async update(id: number, data: any, trx: any, modifiedby: any) {
    try {
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        cabang_nama,
        ...insertData
      } = data;
      let rawFilters: Record<string, any> = {};
      if (filters) {
        if (typeof filters === 'string') {
          try {
            rawFilters = JSON.parse(filters);
          } catch (err) {
            console.error('Gagal parse filters:', err);
            rawFilters = {};
          }
        } else {
          rawFilters = { ...filters };
        }
      }

      // 2. Paksa selalu ada karyawan_id di filterObj
      rawFilters.cabang_id = data.cabang_id;

      // 3. Gunakan filterObj di query nanti
      const filterObj = rawFilters;
      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
        }
      });
      const existingData = await trx(this.tableName).where('id', id).first();

      if (!existingData) {
        throw new Error('Data not found');
      }
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);

      if (hasChanges) {
        insertData.updated_at = this.utilsService.getTime();

        await trx(this.tableName).where('id', id).update(insertData);
      }
      const query = trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.nama',
          'u.keterangan',
          'u.cabang_id',
          'u.statusaktif',
          'u.info',
          'u.modifiedby',
          trx.raw("FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
          'p.memo',
          'p.text',
          'c.nama as cabang_nama',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c', 'u.cabang_id', 'c.id')
        .orderBy(sortBy ? `u.${sortBy}` : 'u.id', sortDirection || 'desc');
      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
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
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('u.nama', 'like', `%${search}%`)
            .orWhere('u.keterangan', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }
      const filteredItems = await query;
      let itemIndex = filteredItems.findIndex(
        (item) => Number(item.id) === Number(id),
      );

      if (itemIndex === -1) {
        itemIndex = 0;
      }

      const pageNumber = Math.floor(itemIndex / limit) + 1;
      const endIndex = pageNumber * limit;

      // Ambil data hingga halaman yang mencakup item baru
      const limitedItems = filteredItems.slice(0, endIndex);

      // Simpan ke Redis
      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT APPROVALHEADER',
          idtrans: id,
          nobuktitrans: id,
          aksi: 'EDIT',
          datajson: JSON.stringify(data),
          modifiedby: modifiedby,
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
      console.error('Error updating:', error);
      throw new Error('Failed to update');
    }
  }
  async delete(id: number, trx: any, modifiedby: any) {
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
          postingdari: 'DELETE APPROVAL HEADER',
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
  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    // Header export
    worksheet.mergeCells('A1:I1');
    worksheet.mergeCells('A2:I2');
    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN APPROVAL HEADER';
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

    // Mendefinisikan header kolom sesuai dengan field yang ada
    const headers = [
      'No.',
      'NAMA',
      'KETERANGAN',
      'NAMA CABANG',
      'MODIFIED BY',
      'CREATED AT',
      'UPDATED AT',
      'STATUS AKTIF',
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

    // Mengisi data ke dalam Excel dengan nomor urut sebagai ID
    data.forEach((row, rowIndex) => {
      worksheet.getCell(rowIndex + 6, 1).value = rowIndex + 1; // Nomor urut (ID)
      worksheet.getCell(rowIndex + 6, 2).value = row.nama;
      worksheet.getCell(rowIndex + 6, 3).value = row.keterangan;
      worksheet.getCell(rowIndex + 6, 4).value = row.cabang_nama;
      worksheet.getCell(rowIndex + 6, 5).value = row.modifiedby;
      worksheet.getCell(rowIndex + 6, 6).value = row.created_at;
      worksheet.getCell(rowIndex + 6, 7).value = row.updated_at;
      worksheet.getCell(rowIndex + 6, 8).value = row.text;

      // Menambahkan border untuk setiap cell
      for (let col = 1; col <= headers.length; col++) {
        const cell = worksheet.getCell(rowIndex + 6, col);
        cell.font = { name: 'Tahoma', size: 10 };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });

    // Mengatur lebar kolom
    worksheet.getColumn(1).width = 10; // Lebar untuk nomor urut
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 40;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 30;
    worksheet.getColumn(8).width = 30;

    // Simpan file Excel ke direktori sementara
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_approvalheader_${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath; // Kembalikan path file sementara
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
          'u.nama',
          'u.keterangan',
          'u.cabang_id',
          'u.statusaktif',
          'u.modifiedby',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
          'c.nama as cabang_nama',
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('cabang as c', 'u.cabang_id', 'c.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'u.id', 'temp.id')

        .orderBy('u.nama', 'ASC');

      const data = await query;

      const dropTempTableQuery = `DROP TABLE ${tempData};`;
      await dbMssql.raw(dropTempTableQuery);

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }
}
