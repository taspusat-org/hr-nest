import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateParameterDto } from './dto/create-parameter.dto';
import { UpdateParameterDto } from './dto/update-parameter.dto';
import { dbMssql } from 'src/common/utils/db';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import { UtilsService } from 'src/utils/utils.service';
import { RedisService } from 'src/common/redis/redis.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { Workbook } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
@Injectable()
export class ParameterService {
  private readonly tableName = 'parameter';
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

      // Siapkan query dasar dengan alias "m" untuk tabel utama
      const query = trx(this.tableName)
        .select(
          'id',
          'grp',
          'subgrp',
          'kelompok',
          'text',
          'memo',
          'type',
          'default',
          'modifiedby',
          'info',
          dbMssql.raw(
            "FORMAT(created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        )
        .orderBy(sortBy ? `${sortBy}` : 'id', sortDirection || 'desc')
        .where('id', '<=', newItem.id); // Filter berdasarkan ID yang lebih kecil atau sama dengan newItem.id

      // Perbaikan bagian filters
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('grp', 'like', `%${search}%`)
            .orWhere('subgrp', 'like', `%${search}%`)
            .orWhere('kelompok', 'like', `%${search}%`)
            .orWhere('text', 'like', `%${search}%`)
            .orWhere('memo', 'like', `%${search}%`)
            .orWhere('type', 'like', `%${search}%`)
            .orWhere('default', 'like', `%${search}%`)
            .orWhere('modifiedby', 'like', `%${search}%`)

            .orWhere('info', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw(
                `FORMAT(${key}, 'dd-MM-yyyy HH:mm:ss') LIKE ?`,
                [`%${value}%`],
              );
            } else {
              query.andWhere(key, 'like', `%${value}%`);
            }
          }
        }
      }

      // Ambil hasil query yang terfilter
      const filteredItems = await query;

      // Cari index item baru di hasil yang sudah difilter
      const itemIndex = filteredItems.findIndex(
        (item) => item.id === newItem.id,
      );

      if (itemIndex === -1) {
        throw new Error('Item baru tidak ditemukan di hasil pencarian');
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
          postingdari: 'ADD PARAMETER',
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
      throw new Error(`Error creating parameter: ${error.message}`);
    }
  }

  async findAll({
    search,
    filters,
    pagination,
    sort,
    isLookUp,
  }: FindAllParams) {
    try {
      let { page, limit } = pagination;

      page = page ?? 1;
      limit = limit ?? 0;
      if (isLookUp) {
        // Count the total number of records in the ACO table (assuming 'aco' is the table)
        const acoCountResult = await dbMssql(this.tableName)
          .count('id as total')
          .first();

        const acoCount = acoCountResult?.total || 0;

        // If there are more than 500 ACO records, limit the results
        if (Number(acoCount) > 500) {
          return { data: { type: 'json' } };
        } else {
          limit = 0; // If ACO records are below 500, return all data
        }
      }
      const offset = (page - 1) * limit;

      const query = dbMssql(this.tableName).select(
        'id',
        'grp',
        'subgrp',
        'kelompok',
        'text',
        'memo',
        'type',
        'default',
        'modifiedby',
        'info',
        dbMssql.raw("FORMAT(created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at"),
        dbMssql.raw("FORMAT(updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at"),
      );
      if (limit > 0) {
        query.limit(limit).offset(offset);
      }

      if (search) {
        query.where((builder) => {
          builder.orWhere('text', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw(
                `FORMAT(${key}, 'dd-MM-yyyy HH:mm:ss') LIKE ?`,
                [`%${value}%`],
              );
            } else {
              query.andWhere(key, 'like', `%${value}%`);
            }
          }
        }
      }

      const result = await dbMssql(this.tableName).count('id as total').first();
      const total = result?.total as number;

      const totalPages = Math.ceil(total / limit);
      if (sort?.sortBy && sort?.sortDirection) {
        query.orderBy(sort.sortBy, sort.sortDirection);
      }
      const responseType = Number(total) > 500 ? 'json' : 'local';

      const parameters = await query;

      return {
        data: parameters,
        total,
        type: responseType,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      console.error('Error fetching parameters:', error);
      throw new Error('Failed to fetch parameters');
    }
  }

  async getById(id: number, trx: any) {
    try {
      // Fetch data by id from the database table
      const result = await trx(this.tableName).where('id', id).first();

      // Check if data is found
      if (!result) {
        throw new Error('Data not found');
      }

      return result;
    } catch (error) {
      console.error('Error fetching data by id:', error);
      throw new Error('Failed to fetch data by id');
    }
  }

  async findAllByIds(ids: { id: number }[]) {
    try {
      const idList = ids.map((item) => item.id);
      const tempData = `##temp_${Math.random().toString(36).substring(2, 15)}`;

      // Membuat temporary table
      const createTempTableQuery = `
        CREATE TABLE ${tempData} (
          id INT
        );
      `;
      await dbMssql.raw(createTempTableQuery);

      // Memasukkan data ID ke dalam temporary table
      const insertTempTableQuery = `
        INSERT INTO ${tempData} (id)
        VALUES ${idList.map((id) => `(${id})`).join(', ')};  
      `;
      await dbMssql.raw(insertTempTableQuery);

      // Menggunakan alias 'u' untuk tabel utama
      const query = dbMssql(`${this.tableName} AS u`)
        .select(
          'u.id',
          'u.grp',
          'u.subgrp',
          'u.kelompok',
          'u.text',
          'u.memo',
          'u.type',
          'u.default',
          'u.modifiedby',
          'u.info',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        )
        .join(dbMssql.raw(`${tempData} AS temp`), 'u.id', 'temp.id') // Memperbaiki JOIN dengan alias yang benar
        .orderBy('u.grp', 'ASC'); // Menambahkan alias 'u' di bagian order by

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
        throw new Error('Parameter not found');
      }
      data.memo = JSON.stringify(data.memo);

      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        // text,
        statusaktif_text,
        ...insertData
      } = data;
      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
        }
      });
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);

      // If memo is an object, serialize it to a JSON string
      if (insertData.memo && typeof insertData.memo === 'object') {
        insertData.memo = JSON.stringify(insertData.memo); // Convert object to JSON string
      } else if (insertData.memo === undefined || insertData.memo === null) {
        insertData.memo = ''; // Assign empty string if memo is undefined or null
      }

      if (hasChanges) {
        insertData.updated_at = this.utilsService.getTime();

        await trx(this.tableName).where('id', id).update(insertData);
      }

      const query = trx(this.tableName)
        .select(
          'id',
          'grp',
          'subgrp',
          'kelompok',
          'text',
          'memo',
          'type',
          'default',
          'modifiedby',
          'info',
          dbMssql.raw(
            "FORMAT(created_at, 'dd-MM-yyyy HH:mm:ss') AS created_at",
          ),
          dbMssql.raw(
            "FORMAT(updated_at, 'dd-MM-yyyy HH:mm:ss') AS updated_at",
          ),
        )
        .orderBy(sortBy ? `${sortBy}` : 'id', sortDirection || 'desc')
        .where('id', '<=', id); // Filter berdasarkan ID yang lebih kecil atau sama dengan newItem.id

      // Perbaikan bagian filters
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('grp', 'like', `%${search}%`)
            .orWhere('subgrp', 'like', `%${search}%`)
            .orWhere('kelompok', 'like', `%${search}%`)
            .orWhere('text', 'like', `%${search}%`)
            .orWhere('memo', 'like', `%${search}%`)
            .orWhere('type', 'like', `%${search}%`)
            .orWhere('default', 'like', `%${search}%`)
            .orWhere('modifiedby', 'like', `%${search}%`)

            .orWhere('info', 'like', `%${search}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw(
                `FORMAT(${key}, 'dd-MM-yyyy HH:mm:ss') LIKE ?`,
                [`%${value}%`],
              );
            } else {
              query.andWhere(key, 'like', `%${value}%`);
            }
          }
        }
      }

      // Ambil hasil query yang terfilter
      const filteredItems = await query;

      // Cari index item baru di hasil yang sudah difilter
      const itemIndex = filteredItems.findIndex((item) => item.id === id);

      if (itemIndex === -1) {
        throw new Error('Item baru tidak ditemukan di hasil pencarian');
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
          postingdari: 'EDIT PARAMETER',
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

  async delete(id: number, trx: any) {
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
          postingdari: 'DELETE PARAMETER',
          idtrans: deletedData.id,
          nobuktitrans: deletedData.id,
          aksi: 'DELETE',
          datajson: JSON.stringify(deletedData),
          modifiedby: deletedData.modifiedby,
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
  async validateRows(rows: { key: string; value: string }[]) {
    const errors: { rowIndex: number; message: string }[] = [];

    for (const [index, row] of rows.entries()) {
      const { key, value } = row;

      if (!key.trim() || !value.trim()) {
        // Ambil pesan error dari database berdasarkan kode 'WI'
        const errorMessage = await dbMssql('error')
          .select('ket')
          .where('kode', 'WI')
          .first();

        errors.push({
          rowIndex: index,
          message: errorMessage?.keterangan || 'Key dan Value wajib diisi',
        });
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    // Header export
    worksheet.mergeCells('A1:F1');
    worksheet.mergeCells('A2:F2');
    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN PARAMETER';
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
      'GROUP',
      'SUB GROUP',
      'KELOMPOK',
      'TEXT',
      'MEMO',
      'CREATED AT',
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
      worksheet.getCell(rowIndex + 6, 2).value = row.grp;
      worksheet.getCell(rowIndex + 6, 3).value = row.subgrp;
      worksheet.getCell(rowIndex + 6, 4).value = row.kelompok;
      worksheet.getCell(rowIndex + 6, 5).value = row.text;
      worksheet.getCell(rowIndex + 6, 6).value = row.memo;
      worksheet.getCell(rowIndex + 6, 7).value = row.created_at;

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
    worksheet.getColumn(7).width = 30;

    // Simpan file Excel ke direktori sementara
    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_parameter${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath; // Kembalikan path file sementara
  }
}
