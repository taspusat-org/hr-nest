import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateJeniscatatanDto } from './dto/create-jeniscatatan.dto';
import { UpdateJeniscatatanDto } from './dto/update-jeniscatatan.dto';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { dbMssql } from 'src/common/utils/db';
import { RedisService } from 'src/common/redis/redis.service';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { Workbook } from 'exceljs';
import path from 'path';
import * as fs from 'fs';

@Injectable()
export class JeniscatatanService {
  private readonly tableName = 'jeniscatatan';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}

  async create(data: any, trx: any, modifiedby: any) {
    try {
      data.updated_at = this.utilsService.getTime();
      data.created_at = this.utilsService.getTime();

      Object.keys(data).forEach((key) => {
        if (typeof data[key] === 'string') {
          data[key] = data[key].toUpperCase();
        }
      });
      const insertedItems = await trx(this.tableName)
        .insert(data)
        .returning('*');

      const newItem = insertedItems[0];

      const itemsPerPage = 30;

      const itemIndex = await trx(this.tableName)
        .select('*')
        .orderBy('nama')
        .where('id', '<=', newItem.id)
        .then((result) => result.findIndex((item) => item.id === newItem.id));

      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;
      const endIndex = pageNumber * itemsPerPage;

      const limitedItems = await trx(this.tableName)
        .select('*')
        .orderBy('nama')
        .limit(endIndex);

      await this.redisService.set(
        `${this.tableName}-allitems`,
        JSON.stringify(limitedItems),
      );
      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD JENIS CATATAN',
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
      throw new Error(`Error creating jenis catatan: ${error.message}`);
    }
  }

  async findAllByIds(ids: { id: number }[]) {
    try {
      const idList = ids.map((item) => item.id);
      const tempData = `##temp_${Math.random().toString(36).substring(2, 15)}`;
      // Membuat temporary table
      const createTempTableQuery = `CREATE TABLE ${tempData} (id INT);`;
      await dbMssql.raw(createTempTableQuery);

      // Memasukkan data ID ke dalam temporary table
      const insertTempTableQuery = `
        INSERT INTO ${tempData} (id) 
        VALUES ${idList.map((id) => `(${id})`).join(', ')};
      `;
      await dbMssql.raw(insertTempTableQuery);

      // Query utama dengan JOIN ke temporary table
      const query = dbMssql(`${this.tableName} as j`)
        .select([
          'j.id',
          'j.nama',
          'j.keterangan',
          'j.statusaktif',
          'p.memo',
          'p.text',
          'j.modifiedby',
          dbMssql.raw(
            "FORMAT(j.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(j.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        ])
        .leftJoin('parameter as p', 'j.statusaktif', 'p.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'j.id', 'temp.id') // Menggunakan JOIN antar tabel user dan temporary table
        .orderBy('j.nama', 'ASC');

      const data = await query;

      // Menghapus temporary table setelah query selesai
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

      const query = dbMssql(`${this.tableName} as j`)
        .select([
          'j.id',
          'j.nama',
          'j.keterangan',
          'j.statusaktif',
          'p.memo',
          'p.text',
          'j.modifiedby',
          dbMssql.raw(
            "FORMAT(j.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(j.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        ])
        .leftJoin('parameter as p', 'j.statusaktif', 'p.id');

      if (limit > 0) {
        const offset = (page - 1) * limit;
        query.limit(limit).offset(offset);
      }
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('j.nama', 'like', `%${search}%`)
            .orWhere('j.keterangan', 'like', `%${search}%`)
            .orWhere('j.modifiedby', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(j.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`j.${key}`, 'like', `%${value}%`);
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

  findOne(id: number) {
    return `This action returns a #${id} jeniscatatan`;
  }

  async update(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();
      if (!existingData) {
        throw new Error('JenisCatatan not found');
      }
      const hasChanges = this.utilsService.hasChanges(data, existingData);
      if (hasChanges) {
        data.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', id).update(data);
      }
      const itemsPerPage = 30;

      const allItems = await trx(this.tableName).select('*').orderBy('nama');

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
          postingdari: 'EDIT JENIS CATATAN',
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
      console.error('Error updating jenis catatan:', error);
      throw new Error('Failed to update jenis catatan');
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
          postingdari: 'DELETE JENIS CATATAN',
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
    worksheet.getCell('A2').value = 'LAPORAN JENIS CATATAN';
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
      'NAMA',
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
      worksheet.getCell(rowIndex + 6, 2).value = row.nama;
      worksheet.getCell(rowIndex + 6, 3).value = row.keterangan;
      worksheet.getCell(rowIndex + 6, 4).value = row.text;
      worksheet.getCell(rowIndex + 6, 5).value = row.modifiedby;
      worksheet.getCell(rowIndex + 6, 6).value = row.created_at;
      worksheet.getCell(rowIndex + 6, 7).value = row.updated_at;

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
    worksheet.getColumn(3).width = 45;
    worksheet.getColumn(4).width = 40;
    worksheet.getColumn(5).width = 40;
    worksheet.getColumn(6).width = 40;
    worksheet.getColumn(7).width = 40;

    // Simpan file Excel ke direktori sementara
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_jeniscatatan${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }
}
