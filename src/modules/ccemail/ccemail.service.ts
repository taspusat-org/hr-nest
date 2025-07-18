import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCcemailDto } from './dto/create-ccemail.dto';
import { UpdateCcemailDto } from './dto/update-ccemail.dto';
import { dbMssql } from 'src/common/utils/db';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import Redis from 'ioredis';
import { RedisService } from 'src/common/redis/redis.service';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { Workbook } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CcemailService {
  private readonly tableName: string = 'ccemail';

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}

  async create(data: any, trx: any) {
    try {
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        statusaktif_text,
        ...insertData
      } = data;

      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
        }
      });

      // const insertData = {
      //   nama: data.nama.toUpperCase(),
      //   email: data.email.toUpperCase(),
      //   statusaktif: data.statusaktif,
      //   modifiedby: data.modifiedby,
      //   created_at: this.utilsService.getTime(),
      //   updated_at: this.utilsService.getTime()
      // }

      const insertedItems = await trx(this.tableName)
        .insert(insertData)
        .returning('*');

      const newItem = insertedItems[0];

      const itemsPerPage = data.limit || 30;

      // Siapkan query dasar
      const query = trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.nama',
          'u.email',
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
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .orderBy(sortBy ? `u.${sortBy}` : 'u.id', sortDirection || 'desc')
        .where('u.id', '<=', newItem.id); // Filter berdasarkan ID yang lebih kecil atau sama dengan newItem.id

      // Terapkan filtering tambahan jika ada
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

      // Terapkan search jika ada
      if (search) {
        query.where((builder) => {
          builder

            .orWhere('u.nama', 'like', `%${search}%`)
            .orWhere('u.email', 'like', `%${search}%`);
          // .orWhere('p.memo', 'like', `%${search}%`)
          // .orWhere('p.text', 'like', `%${search}%`);
        });
      }

      // Ambil hasil query yang terfilter
      const filteredItems = await query;

      // Cari index item baru di hasil yang sudah difilter
      let itemIndex = filteredItems.findIndex((item) => item.id === newItem.id);

      if (itemIndex === -1) {
        itemIndex = 0;
      }

      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;
      const endIndex = pageNumber * itemsPerPage;
      // const indexOnPage = itemIndex % itemsPerPage;

      // Ambil data hingga halaman yang mencakup item baru
      const limitedItems = filteredItems.slice(0, endIndex);

      // const paginationData = JSON.stringify({
      //   pageNumber,
      //   indexOnPage,
      // });

      await this.redisService.set(
        `${this.tableName}-allItems`,
        // paginationData,
        JSON.stringify(limitedItems),
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'ADD CC EMAIL',
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
        // indexOnPage,
        itemIndex,
      };
    } catch (error) {
      throw new Error(`Error creating ccemail: ${error.message}`);
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
          'u.nama',
          'u.email',
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
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id');

      if (limit > 0) {
        const offset = (page - 1) * limit;
        query.limit(limit).offset(offset);
      }

      if (search) {
        query.where((builder) => {
          builder

            .orWhere('u.nama', 'like', `%${search}%`)
            .orWhere('u.email', 'like', `%${search}%`);
          // .orWhere('p.memo', 'like', `%${search}%`)
          // .orWhere('p.text', 'like', `%${search}%`);
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
      const total = result?.total as number;
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
      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.nama',
          'u.email',
          'u.statusaktif',
          'u.modifiedby',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .join('parameter as p', 'u.statusaktif', 'p.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'u.id', 'temp.id') // Menggunakan JOIN antar tabel user dan temporary table
        .orderBy('u.nama', 'ASC');

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
        statusaktif_text,
        ...updateData
      } = data;

      Object.keys(updateData).forEach((key) => {
        if (typeof updateData[key] === 'string') {
          updateData[key] = updateData[key].toUpperCase();
        }
      });

      const hasChanges = this.utilsService.hasChanges(updateData, existingData);

      if (hasChanges) {
        updateData.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', id).update(updateData);
      }

      // Ambil semua item dengan filter ID yang lebih kecil atau sama dengan yang diupdate
      const query = trx(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.nama',
          'u.email',
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
        ])
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .orderBy(sortBy ? `u.${sortBy}` : 'u.id', sortDirection || 'desc')
        .where('u.id', '<=', id); // Filter berdasarkan ID yang lebih kecil atau sama dengan newItem.id

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

      if (search) {
        query.where((builder) => {
          builder

            .orWhere('u.nama', 'like', `%${search}%`)
            .orWhere('u.email', 'like', `%${search}%`);
        });
      }

      const allItems = await query;

      // Cari index item yang baru saja diupdate
      let itemIndex = allItems.findIndex((item) => Number(item.id) === id);

      if (itemIndex === -1) {
        itemIndex = 0;
      }

      const itemsPerPage = limit || 30;
      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;

      // Ambil data hingga halaman yang mencakup item yang baru diperbarui
      const endIndex = pageNumber * itemsPerPage;
      const limitedItems = allItems.slice(0, endIndex);

      // const paginationData = JSON.stringify({
      //   pageNumber,
      //   indexOnPage,
      // });

      // Simpan ke Redis
      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT CC EMAIL',
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
      console.error('Error updating ccemail:', error);
      throw new Error('Failed to update ccemail');
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
          postingdari: 'DELETE CC EMAIL',
          idtrans: deletedData.id,
          nobuktitrans: deletedData.id,
          aksi: 'DELETE',
          datajson: JSON.stringify(deletedData),
          modifiedby: modifiedby,
        },
        trx,
      );

      return {
        status: 200,
        message: 'Data deleted successfully',
        deletedData,
      };
    } catch (error) {
      console.error('Error deleting data: ', error);
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
    worksheet.mergeCells('A1:D1');
    worksheet.mergeCells('A2:D2');
    worksheet.mergeCells('A3:D3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN CC EMAIL';
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
    const headers = ['No.', 'Nama', 'Email', 'Status Aktif'];

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
      worksheet.getCell(rowIndex + 6, 3).value = row.email;
      worksheet.getCell(rowIndex + 6, 4).value = row.text;

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
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn('F').numFmt = 'dd-mm-yyyy hh:mm:ss';

    // Simpan file Excel ke direktori sementara
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_ccemail${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath; // Kembalikan path file sementara
  }
}
