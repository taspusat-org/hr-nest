import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCabangDto } from './dto/create-cabang.dto';
import { UpdateCabangDto } from './dto/update-cabang.dto';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { dbMssql } from 'src/common/utils/db';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { RedisService } from 'src/common/redis/redis.service';
import { Workbook } from 'exceljs';
import path from 'path';
import * as fs from 'fs';

@Injectable()
export class CabangService {
  private readonly tableName = 'cabang';
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
        periode_text,
        minuscuti_text,
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

      const allItems = await trx(this.tableName).select('*').orderBy('nama');

      const itemIndex = allItems.findIndex((item) => item.id === newItem.id);
      const itemsPerPage = 10;
      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;
      const indexOnPage = itemIndex % itemsPerPage;

      const paginationData = JSON.stringify({
        pageNumber,
        indexOnPage,
      });

      await this.redisService.set(
        `${this.tableName}-${newItem.id}`,
        paginationData,
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD CABANG',
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
        indexOnPage,
      };
    } catch (error) {
      throw new Error(`Error creating cabang: ${error.message}`);
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

      const query = dbMssql(`${this.tableName} as c`)
        .select([
          'c.id',
          'c.kodecabang',
          'c.nama as namacabang',
          'c.keterangan',
          'c.statusaktif',
          'p.memo',
          'p.text',
          'c.modifiedby',
          dbMssql.raw(
            "FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        ])
        .join('parameter as p', 'c.statusaktif', 'p.id')
        .leftJoin('parameter as p3', 'c.minuscuti', 'p.id')
        .leftJoin('parameter as p2', 'c.periode', 'p2.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'c.id', 'temp.id')
        .orderBy('c.nama', 'ASC');

      const data = await query;

      const dropTempTableQuery = `DROP TABLE ${tempData};`;
      await dbMssql.raw(dropTempTableQuery);

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }

  async findAll({ search, filters, pagination, sort }: FindAllParams) {
    try {
      let { page, limit } = pagination;

      page = page ?? 1;
      limit = limit ?? 0;

      const query = dbMssql(`${this.tableName} as c`)
        .select([
          'c.id',
          'c.kodecabang',
          'c.nama as namacabang',
          'c.keterangan',
          'c.statusaktif',
          'c.periode',
          'p.memo',
          'p.text',
          'p2.text as periode_text',
          'p3.text as minuscuti_text',
          'c.modifiedby',
          dbMssql.raw(
            "FORMAT(c.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(c.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        ])
        .leftJoin('parameter as p', 'c.statusaktif', 'p.id')
        .leftJoin('parameter as p3', 'c.minuscuti', 'p3.id')
        .leftJoin('parameter as p2', 'c.periode', 'p2.id');

      if (limit > 0) {
        const offset = (page - 1) * limit;
        query.limit(limit).offset(offset);
      }
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('c.kodecabang', 'like', `%${search}%`)
            .orWhere('c.nama', 'like', `%${search}%`)
            .orWhere('c.keterangan', 'like', `%${search}%`)

            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(c.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`c.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      const result = await dbMssql(this.tableName).count('id as total').first();
      const total = result?.total as number;

      // Jika limit ada, hitung total pages berdasarkan limit
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

      if (sort?.sortBy && sort?.sortDirection) {
        query.orderBy(sort.sortBy, sort.sortDirection);
      }

      const data = await query;

      return {
        data: data,
        total,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit > 0 ? limit : total, // Jika limit tidak ada, return semua data
        },
      };
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
    }
  }

  async checkRole(id: number) {
    try {
      const cabangUsage = await dbMssql('karyawan')
        .where({ cabang_id: id })
        .select('cabang_id');

      return cabangUsage.length > 0;
    } catch (error) {
      console.error('Error in processCheckCabang:', error);
      throw new Error('Failed to check cabang usage');
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} cabang`;
  }

  async update(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();

      if (!existingData) {
        throw new Error('Data not found');
      }
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        periode_text,
        minuscuti_text,
        ...insertData
      } = data;
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);

      if (hasChanges) {
        data.updated_at = this.utilsService.getTime();

        await trx(this.tableName).where('id', id).update(insertData);
      }

      const allItems = await trx(this.tableName).select('*').orderBy('nama');

      const itemIndex = allItems.findIndex((item) => Number(item.id) === id);
      if (itemIndex === -1) {
        throw new Error('Updated item not found in all items');
      }

      const itemsPerPage = 10;
      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;
      const indexOnPage = itemIndex % itemsPerPage;

      const paginationData = JSON.stringify({
        pageNumber,
        indexOnPage,
      });

      await this.redisService.set(`${this.tableName}-${id}`, paginationData);
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT CABANG',
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
        indexOnPage,
      };
    } catch (error) {
      console.error('Error updating cabang:', error);
      throw new Error('Failed to update cabang');
    }
  }

  async remove(id: number, trx: any, modifiedby: string) {
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
          postingdari: 'DELETE USER',
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
    worksheet.mergeCells('A1:F1');
    worksheet.mergeCells('A2:F2');
    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN CABANG';
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

    // Mendefinisikan header kolom
    const headers = [
      'No.',
      'KODE CABANG',
      'NAMA CABANG',
      'KETERANGAN',
      'STATUS AKTIF',
      'MODIFIED BY',
      'CREATED AT',
      'UPDATED AT',
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
      worksheet.getCell(rowIndex + 6, 2).value = row.kodecabang;
      worksheet.getCell(rowIndex + 6, 3).value = row.namacabang;
      worksheet.getCell(rowIndex + 6, 4).value = row.keterangan;
      worksheet.getCell(rowIndex + 6, 5).value = row.text;
      worksheet.getCell(rowIndex + 6, 6).value = row.modifiedby;
      worksheet.getCell(rowIndex + 6, 7).value = row.created_at;
      worksheet.getCell(rowIndex + 6, 8).value = row.updated_at;

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
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 45;
    worksheet.getColumn(5).width = 40;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 40;
    worksheet.getColumn(8).width = 40;

    // Simpan file Excel ke direktori sementara
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_cabang${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath; // Kembalikan path file sementara
  }
}
