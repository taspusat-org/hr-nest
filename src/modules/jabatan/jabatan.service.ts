import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateJabatanDto } from './dto/create-jabatan.dto';
import { UpdateJabatanDto } from './dto/update-jabatan.dto';
import { RedisService } from 'src/common/redis/redis.service';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { dbMssql } from 'src/common/utils/db';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import path, { join } from 'path';
import * as fs from 'fs';
import { Workbook } from 'exceljs';

@Injectable()
export class JabatanService {
  private readonly tableName: string = 'jabatan';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}

  async create(data: any, trx: any) {
    try {
      data.updated_at = this.utilsService.getTime();
      data.created_at = this.utilsService.getTime();
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        ...insertData
      } = data;
      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
        }
      });
      const insertedItems = await trx(this.tableName)
        .insert(insertData)
        .returning('*');

      const newItem = insertedItems[0];

      const query = trx(`${this.tableName} as jabatan`)
        .select([
          'jabatan.id as id',
          'jabatan.nama',
          'jabatan.keterangan',
          'jabatan.statusaktif',
          'jabatan.modifiedby',
          trx.raw(
            "FORMAT(jabatan.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          trx.raw(
            "FORMAT(jabatan.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin(
          trx.raw('parameter as p with (readuncommitted)'),
          'jabatan.statusaktif',
          'jabatan.id',
        )
        .orderBy(
          sortBy ? `jabatan.${sortBy}` : 'jabatan.id',
          sortDirection || 'desc',
        );
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('nama', 'like', `%${search}%`)
            .orWhere('keterangan', 'like', `%${search}%`)
            .orWhere('jabatan.modifiedby', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw(
                "FORMAT(jabatan.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?",
                [key, `%${value}%`],
              );
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`jabatan.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      const filteredItems = await query;

      // Cari index item baru di hasil yang sudah difilter
      let itemIndex = filteredItems.findIndex(
        (item) => Number(item.id) === Number(newItem.id),
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
          postingdari: 'ADD JABATAN',
          idtrans: newItem.id,
          nobuktitrans: newItem.id,
          aksi: 'ADD',
          datajson: JSON.stringify(newItem),
          modifiedby: newItem.modifiedby,
        },
        trx,
      );
      return {
        newItem,
        pageNumber,
        itemIndex,
      };
    } catch (error) {
      throw new Error(`Error creating jabatan: ${error.message}`);
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

      const query = dbMssql(`${this.tableName} as jabatan`)
        .select([
          'jabatan.id as id',
          'jabatan.nama',
          'jabatan.keterangan',
          'jabatan.statusaktif',
          'jabatan.modifiedby',
          dbMssql.raw(
            "FORMAT(jabatan.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(jabatan.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .join('parameter as p', 'jabatan.statusaktif', 'p.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'jabatan.id', 'temp.id')
        .orderBy('jabatan.nama', 'ASC');

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
  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;
      page = page ?? 1;
      limit = limit ?? 0;

      const offset = (page - 1) * limit;

      const query = dbMssql(`${this.tableName} as jabatan`)
        .select([
          'jabatan.id as id',
          'jabatan.nama',
          'jabatan.keterangan',
          'jabatan.statusaktif',
          'jabatan.modifiedby',
          dbMssql.raw(
            "FORMAT(jabatan.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(jabatan.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin(
          dbMssql.raw('parameter as p with (readuncommitted)'),
          'jabatan.statusaktif',
          'p.id',
        );

      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      if (search) {
        query.where((builder) => {
          builder
            .orWhere('nama', 'like', `%${search}%`)
            .orWhere('keterangan', 'like', `%${search}%`)
            .orWhere('jabatan.modifiedby', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw(
                "FORMAT(jabatan.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?",
                [key, `%${value}%`],
              );
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`jabatan.${key}`, 'like', `%${value}%`);
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
      throw new Error(error);
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} jabatan`;
  }

  async update(id: number, data: any, trx: any) {
    try {
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        ...insertData
      } = data;
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
      const query = trx(`${this.tableName} as jabatan`)
        .select([
          'jabatan.id as id',
          'jabatan.nama',
          'jabatan.keterangan',
          'jabatan.statusaktif',
          'jabatan.modifiedby',
          trx.raw(
            "FORMAT(jabatan.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          trx.raw(
            "FORMAT(jabatan.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .leftJoin(
          trx.raw('parameter as p with (readuncommitted)'),
          'jabatan.statusaktif',
          'p.id',
        )
        .orderBy(
          sortBy ? `jabatan.${sortBy}` : 'jabatan.id',
          sortDirection || 'desc',
        );
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('nama', 'like', `%${search}%`)
            .orWhere('keterangan', 'like', `%${search}%`)
            .orWhere('jabatan.modifiedby', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw(
                "FORMAT(jabatan.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?",
                [key, `%${value}%`],
              );
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`jabatan.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      const filteredItems = await query;
      // Cari index item baru di hasil yang sudah difilter
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
          postingdari: 'EDIT JABATAN',
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
      console.error('Error updating jabatan:', error);
      throw new Error('Failed to update jabatan');
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
          postingdari: 'DELETE JABATAN',
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

    worksheet.mergeCells('A1:D1');
    worksheet.mergeCells('A2:D2');
    worksheet.mergeCells('A3:D3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN JABATAN';
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

    const headers = ['No.', 'Nama', 'Keterangan', 'Status Aktif'];
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

    data.forEach((row, rowIndex) => {
      worksheet.getCell(rowIndex + 6, 1).value = rowIndex + 1;
      worksheet.getCell(rowIndex + 6, 2).value = row.nama;
      worksheet.getCell(rowIndex + 6, 3).value = row.keterangan;
      worksheet.getCell(rowIndex + 6, 4).value = row.text;

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

    worksheet.getColumn(1).width = 5; // Lebar untuk nomor urut
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_jabatan${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);
    return tempFilePath;
  }
}
