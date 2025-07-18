import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { dbMssql } from 'src/common/utils/db';
import { RedisService } from 'src/common/redis/redis.service';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
import { FindAllParams } from 'src/common/interfaces/all.interface';
import * as fs from 'fs';
import * as path from 'path';
import { Workbook } from 'exceljs';
@Injectable()
export class MenuService {
  private readonly tableName = 'menus';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisService: RedisService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}
  async create(createMenuDto: any, trx: any) {
    try {
      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        parent_nama,
        acos_nama,
        statusaktif_nama,
        ...insertData
      } = createMenuDto;
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
      const query = trx(`${this.tableName} as m`)
        .select([
          'm.id as id',
          'm.title',
          'm.aco_id',
          'm.icon',
          'm.parentId',
          'm.order',
          'm.statusaktif',
          trx.raw("FORMAT(m.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(m.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
          'p.memo',
          'p.text',
          'a.nama as acos_nama',
          trx.raw('parent.title as parent_nama'), // Select the parent title
        ])
        .leftJoin(`${this.tableName} as parent`, 'm.parentId', 'parent.id') // Self join on parentId
        .leftJoin('parameter as p', 'm.statusaktif', 'p.id')
        .leftJoin('acos as a', 'm.aco_id', 'a.id')
        .orderBy(sortBy ? `m.${sortBy}` : 'm.id', sortDirection || 'desc')
        .where('m.id', '<=', newItem.id); // Filter berdasarkan ID yang lebih kecil atau sama dengan newItem.id

      // Perbaikan bagian filters
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(m.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`m.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      // Perbaikan bagian search
      if (search) {
        query.where((builder) => {
          builder
            .orWhere('m.title', 'like', `%${search}%`)
            .orWhere('m.parentId', 'like', `%${search}%`)
            .orWhere('m.icon', 'like', `%${search}%`)
            .orWhere('m.modifiedby', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
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
          postingdari: 'ADD MENU',
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
        const acoCountResult = await dbMssql(this.tableName)
          .count('id as total')
          .first();

        const acoCount = acoCountResult?.total || 0;

        if (Number(acoCount) > 500) {
          return { data: { type: 'json' } };
        } else {
          limit = 0;
        }
      }

      const query = dbMssql(`${this.tableName} as u`)
        .select([
          'u.id as id',
          'u.title',
          'u.aco_id',
          'u.icon',
          'u.parentId',
          'u.order',
          'u.statusaktif',
          dbMssql.raw(
            "FORMAT(u.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(u.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
          'a.nama as acos_nama',
          dbMssql.raw('parent.title as parent_nama'), // Select the parent title
        ])
        .leftJoin(`${this.tableName} as parent`, 'u.parentId', 'parent.id') // Self join on parentId
        .leftJoin('parameter as p', 'u.statusaktif', 'p.id')
        .leftJoin('acos as a', 'u.aco_id', 'a.id');

      if (limit > 0) {
        const offset = (page - 1) * limit;
        query.limit(limit).offset(offset);
      }

      if (search) {
        const sanitizedValue = String(search).replace(/\[/g, '[[]');
        query.where((builder) => {
          builder

            .orWhere('u.title', 'like', `%${sanitizedValue}%`)
            .orWhere('u.parentId', 'like', `%${sanitizedValue}%`)
            .orWhere('u.icon', 'like', `%${sanitizedValue}%`)
            .orWhere('p.memo', 'like', `%${sanitizedValue}%`)
            .orWhere('p.text', 'like', `%${sanitizedValue}%`);
        });
      }

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          const sanitizedValue = String(value).replace(/\[/g, '[[]');
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(u.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${sanitizedValue}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', sanitizedValue);
            } else {
              query.andWhere(`u.${key}`, 'like', `%${sanitizedValue}%`);
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

      const data = await query;

      const responseType = Number(total) > 500 ? 'json' : 'local';

      return {
        data: data,
        type: responseType,
        total,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      console.error('Error fetching data:', error);
      throw new Error('Failed to fetch data');
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

      const query = dbMssql(`${this.tableName} as m`)
        .select([
          'm.id as id',
          'm.title',
          'm.aco_id',
          'm.icon',
          'm.parentId',
          'm.order',
          'm.statusaktif',
          dbMssql.raw(
            "FORMAT(m.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at",
          ),
          dbMssql.raw(
            "FORMAT(m.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at",
          ),
          'p.memo',
          'p.text',
        ])
        .join('parameter as p', 'm.statusaktif', 'p.id')
        .join(dbMssql.raw(`${tempData} as temp`), 'm.id', 'temp.id')

        .orderBy('m.title', 'ASC');

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

  async update(id: number, data: any, trx: any) {
    try {
      const existingData = await trx(this.tableName).where('id', id).first();

      if (!existingData) {
        throw new Error('Menu not found');
      }

      const {
        sortBy,
        sortDirection,
        filters,
        search,
        page,
        limit,
        text,
        parent_nama,
        acos_nama,
        statusaktif_nama,
        ...insertData
      } = data;
      Object.keys(insertData).forEach((key) => {
        if (typeof insertData[key] === 'string') {
          insertData[key] = insertData[key].toUpperCase();
        }
      });
      const hasChanges = this.utilsService.hasChanges(insertData, existingData);
      if (hasChanges) {
        insertData.updated_at = this.utilsService.getTime();
        await trx(this.tableName).where('id', id).update(insertData);
      }

      const query = trx(`${this.tableName} as m`)
        .select([
          'm.id as id',
          'm.title',
          'm.aco_id',
          'm.icon',
          'm.parentId',
          'm.order',
          'm.statusaktif',
          trx.raw("FORMAT(m.created_at, 'dd-MM-yyyy HH:mm:ss') as created_at"),
          trx.raw("FORMAT(m.updated_at, 'dd-MM-yyyy HH:mm:ss') as updated_at"),
          'p.memo',
          'p.text',
          'a.nama as acos_nama',
          trx.raw('parent.title as parent_nama'), // Select the parent title
        ])
        .leftJoin(`${this.tableName} as parent`, 'm.parentId', 'parent.id') // Self join on parentId
        .leftJoin('parameter as p', 'm.statusaktif', 'p.id')
        .leftJoin('acos as a', 'm.aco_id', 'a.id')
        .orderBy(sortBy ? `m.${sortBy}` : 'm.id', sortDirection || 'desc');

      // Perbaikan bagian filters
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            if (key === 'created_at' || key === 'updated_at') {
              query.andWhereRaw("FORMAT(m.??, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
                key,
                `%${value}%`,
              ]);
            } else if (key === 'text' || key === 'memo') {
              query.andWhere(`p.${key}`, '=', value);
            } else {
              query.andWhere(`m.${key}`, 'like', `%${value}%`);
            }
          }
        }
      }

      // Perbaikan bagian search
      if (search) {
        query.where((builder) => {
          builder
            .orWhereRaw("FORMAT(m.created_at, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              `%${search}%`,
            ])
            .orWhereRaw("FORMAT(m.updated_at, 'dd-MM-yyyy HH:mm:ss') LIKE ?", [
              `%${search}%`,
            ])
            .orWhere('m.title', 'like', `%${search}%`)
            .orWhere('m.parentId', 'like', `%${search}%`)
            .orWhere('m.icon', 'like', `%${search}%`)
            .orWhere('m.modifiedby', 'like', `%${search}%`)
            .orWhere('p.memo', 'like', `%${search}%`)
            .orWhere('p.text', 'like', `%${search}%`);
        });
      }
      // Ambil hasil query yang terfilter
      const allItems = await query;

      // Cari index item yang baru saja diupdate
      const itemIndex = allItems.findIndex((item) => Number(item.id) === id);
      if (itemIndex === -1) {
        throw new Error('Updated item not found in all items');
      }

      const itemsPerPage = limit || 10; // Default 10 items per page, atau yang dikirimkan dari frontend
      const pageNumber = Math.floor(itemIndex / itemsPerPage) + 1;

      // Ambil data hingga halaman yang mencakup item yang baru diperbarui
      const endIndex = pageNumber * itemsPerPage;
      const limitedItems = allItems.slice(0, endIndex);
      await this.redisService.set(
        `${this.tableName}-allItems`,
        JSON.stringify(limitedItems),
      );

      await this.logTrailService.create(
        {
          namatabel: this.tableName,
          postingdari: 'EDIT MENU',
          idtrans: id,
          nobuktitrans: id,
          aksi: 'EDIT',
          datajson: JSON.stringify(data),
          modifiedby: data.modifiedby,
        },
        trx,
      );

      return {
        updatedItem: {
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
          postingdari: 'DELETE MENU',
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

  sortMenuData(menuData) {
    const mapChildren = (menu) => {
      if (menu.items && menu.items.length > 0) {
        menu.items = menu.items
          .sort((a, b) => a.order - b.order)
          .map(mapChildren);
      }
      return menu;
    };

    return menuData.sort((a, b) => a.order - b.order).map(mapChildren);
  }

  async updateMenuResequence(data, parentId = 0, order = 0, trx) {
    if (!Array.isArray(data)) {
      throw new Error("Expected 'data' to be an array.");
    }

    for (const [index, item] of data.entries()) {
      const { id, text, icon, children } = item;

      // Check if item exists in the database
      const existingItem = await trx('menus').where({ id }).first();

      if (existingItem) {
        // Update the existing menu item
        await trx('menus')
          .where({ id })
          .update({
            title: text,
            icon: icon || null,
            parentId,
            order: order + index + 1,
            updated_at: new Date(),
          });
      } else {
        // Insert new menu item
        await trx('menus').insert({
          id,
          title: text,
          icon: icon || null,
          parentId,
          order: order + index + 1,
          updated_at: new Date(),
        });
      }

      // Recursively update children menus if any
      if (Array.isArray(children) && children.length > 0) {
        await this.updateMenuResequence(children, id, order + index + 1, trx);
      }
    }

    // After updating the menus, update the users' menu strings
    const users = await trx('users').select('id');

    for (const user of users) {
      const { abilities } = await this.utilsService.fetchUserRolesAndAbilities(
        user.id,
        trx,
      );

      const menuData = await this.utilsService.getDataMenuSidebar(trx);
      const sortedMenuData = this.sortMenuData(menuData);

      const menuString = this.utilsService.buildMenuString(
        sortedMenuData,
        abilities,
      );

      await trx('users').where({ id: user.id }).update({
        menu: menuString,
        updated_at: new Date(),
      });
    }
  }

  async getMenuSidebar(userId: number) {
    try {
      const user = await dbMssql('users')
        .select('menu')
        .where('id', userId)
        .first();

      if (!user) {
        throw new Error(`User dengan ID ${userId} tidak ditemukan`);
      }

      const menuField = user.menu;
      if (!menuField) {
        throw new Error(`Field menu kosong untuk user ID ${userId}`);
      }

      return menuField;
    } catch (error) {
      console.error('Error fetching user menu sidebar:', error);
      throw new Error('Gagal mengambil data menu sidebar user');
    }
  }
  async getSearchMenu(userId: number, search: string = '') {
    try {
      const userAcls = await dbMssql('useracl')
        .select('aco_id')
        .where('user_id', userId);

      const userRoles = await dbMssql('userrole')
        .select('role_id')
        .where('user_id', userId);

      const roleIds = userRoles.map((role) => role.role_id);

      const roleAcls = await dbMssql('acl')
        .select('aco_id')
        .whereIn('role_id', roleIds);

      const userAcoIds = new Set([
        ...userAcls.map((acl) => acl.aco_id),
        ...roleAcls.map((acl) => acl.aco_id),
      ]);

      let query = dbMssql('menus')
        .select('id', 'title', 'icon', 'parentId', 'order')
        .whereIn('aco_id', Array.from(userAcoIds))
        .orderBy('parentId')
        .orderBy('order');

      if (search) {
        query = query.andWhere('title', 'like', `%${search}%`);
      }

      const menus = await query;

      if (!menus.length) {
        throw new Error(`No menus found for user ID ${userId}`);
      }

      return menus;
    } catch (error) {
      console.error('Error fetching user menu sidebar:', error);
      throw new Error('Gagal mengambil data menu sidebar user');
    }
  }

  async exportToExcel(data: any[]) {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    worksheet.mergeCells('A1:I1');
    worksheet.mergeCells('A2:I2');
    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A1').value = 'PT. TRANSPORINDO AGUNG SEJAHTERA';
    worksheet.getCell('A2').value = 'LAPORAN MENU';
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

    const headers = [
      'NO.',
      'MENU NAME',
      'MENU PARENT',
      'MENU ICON',
      'ACO ID',
      'LINK',
      'ORDER',
      'STATUS AKTIF',
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
    data.forEach((row, rowIndex) => {
      const currentRow = rowIndex + 6;

      worksheet.getCell(currentRow, 1).value = rowIndex + 1;
      worksheet.getCell(currentRow, 2).value = row.title;
      worksheet.getCell(currentRow, 3).value = row.parentId;
      worksheet.getCell(currentRow, 4).value = row.icon;
      worksheet.getCell(currentRow, 5).value = row.aco_id;
      worksheet.getCell(currentRow, 6).value = row.link;
      worksheet.getCell(currentRow, 7).value = row.order;
      worksheet.getCell(currentRow, 8).value = row.text;
      worksheet.getCell(currentRow, 9).value = row.created_at;

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
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 30;

    const tempDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `laporan_menu${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(tempFilePath);

    return tempFilePath;
  }

  async getMenuResequence() {
    const menus = await dbMssql('menus')
      .select('*')
      .orderBy(['parentId', 'order']);

    const itemsMap = new Map<number, any>();
    const rootItems: any[] = [];

    menus.forEach((item) => {
      const menuItem = {
        id: item.id,
        text: item.title,
        ...(item.icon ? { icon: item.icon } : {}),
        children: [],
      };

      itemsMap.set(item.id, menuItem);

      if (item.parentId === 0) {
        rootItems.push(menuItem);
      } else {
        const parentItem = itemsMap.get(item.parentId);
        if (parentItem) {
          parentItem.children.push(menuItem);
        } else {
          itemsMap.set(item.parentId, { children: [menuItem] });
        }
      }
    });

    const sortItems = (items: any[]): any[] => {
      return items
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          ...item,
          children: sortItems(item.children),
        }));
    };

    return sortItems(rootItems);
  }
  async getDataMenuSidebar(userId: number) {
    try {
      // Fetch all ACLs and roles associated with the user
      const userAcls = await dbMssql('useracl')
        .select('aco_id')
        .where('user_id', userId);

      const userRoles = await dbMssql('userrole')
        .select('role_id')
        .where('user_id', userId);

      const roleIds = userRoles.map((role) => role.role_id);

      const roleAcls = await dbMssql('acl')
        .select('aco_id')
        .whereIn('role_id', roleIds);

      // Combine aco_ids from userAcls and roleAcls
      const userAcoIds = new Set([
        ...userAcls.map((acl) => acl.aco_id),
        ...roleAcls.map((acl) => acl.aco_id),
      ]);

      // Fetch menus associated with the user ACOs
      const query = dbMssql('menus')
        .select('id', 'title', 'icon', 'parentId', 'order')
        .whereIn('aco_id', Array.from(userAcoIds))
        .orderBy('parentId')
        .orderBy('order');

      const menus = await query;

      if (!menus.length) {
        throw new Error(`No menus found for user ID ${userId}`);
      }

      return menus;
    } catch (error) {
      console.error('Error fetching user menu sidebar:', error);
      throw new Error('Gagal mengambil data menu sidebar user');
    }
  }
}
