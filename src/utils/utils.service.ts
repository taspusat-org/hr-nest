import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Menu, UserRoleAbilities } from 'src/common/interfaces/all.interface';
import { Users } from 'src/common/interfaces/users.interface';
import { dbMssql } from 'src/common/utils/db';
import sharp, { FormatEnum } from 'sharp';
import multer from 'multer';
import path from 'path';
import * as fs from 'fs';

const mimeToSharpFormat: { [key: string]: keyof FormatEnum } = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};
@Injectable()
export class UtilsService {
  async createTempTable(
    tableName: string,
    trx: any,
    tempError: string,
  ): Promise<string> {
    try {
      const result = await trx(tableName).columnInfo();
      // Fungsi untuk menentukan tipe kolom berdasarkan informasi kolom
      function getColumnType(columnName: string, columnInfo: any): string {
        const { type, maxLength } = columnInfo;

        if (columnName === 'filefoto') {
          return `${columnName} text`; // Kolom filefoto menjadi tipe text
        }
        if (columnName === 'fileberkas') {
          return `${columnName} text`; // Kolom filefoto menjadi tipe text
        }

        // Cek jika tipe kolom adalah nvarchar atau varchar tanpa maxLength, set panjangnya menjadi 255
        if ((type === 'nvarchar' || type === 'varchar') && maxLength === null) {
          return `${columnName} ${type}(255)`;
        }

        // Jika tipe kolom nvarchar dengan maxLength -1, set panjangnya menjadi 255
        if (type === 'nvarchar' && maxLength === -1) {
          return `${columnName} ${type}(255)`;
        }

        // Jika kolom memiliki maxLength yang valid, set panjang sesuai dengan maxLength
        if (maxLength !== null) {
          return `${columnName} ${type}(${maxLength})`;
        }

        // Jika kolom adalah tipe datetime, gunakan datetime2
        if (type === 'datetime') {
          return `${columnName} datetime2`;
        }

        return `${columnName} ${type}`; // Tipe kolom lainnya tetap sesuai dengan tipe yang ada
      }

      // Array untuk menyimpan kolom dan tipe yang akan dibuat
      const columnsToCreate: string[] = [];

      // Proses semua kolom dan tentukan tipe kolomnya
      for (const [columnName, columnInfo] of Object.entries(result)) {
        columnsToCreate.push(getColumnType(columnName, columnInfo));
      }

      // Jika tidak ada kolom created_at, tambahkan kolom tersebut
      if (!result['created_at']) {
        columnsToCreate.push('created_at DATETIME2 NULL');
      }

      // Jika tidak ada kolom updated_at, tambahkan kolom tersebut
      if (!result['updated_at']) {
        columnsToCreate.push('updated_at DATETIME2 NULL');
      }

      // Query untuk membuat temporary table dengan kolom-kolom yang telah ditentukan
      const createTableQuery = `
        CREATE TABLE ${tempError} (
          ${columnsToCreate.join(',\n')}
        )
      `;

      return createTableQuery;
    } catch (error) {
      console.error('Error creating temporary table:', error);
      throw error;
    }
  }

  getTime() {
    return DateTime.now().setZone('Asia/Jakarta').toISO();
  }

  hasChanges(newData: any, existingData: any) {
    for (const key in newData) {
      if (key === 'created_at' || key === 'updated_at') {
        continue;
      }

      if (newData[key] != existingData[key]) {
        return true;
      }
    }
    return false;
  }

  async lockAndDestroy(identifier: any, table: string, field: any = 'id', trx) {
    const record = await trx(table)
      .where(field, identifier)
      .forUpdate()
      .first();

    if (!record) {
      throw new NotFoundException(
        `No data found for '${field}' '${identifier}' in '${table}'`,
      );
    }

    const isDeleted = await trx(table).where(field, identifier).delete();

    if (!isDeleted) {
      throw new InternalServerErrorException(
        `Error deleting '${field}' = '${identifier}' in '${table}'`,
      );
    }

    return record;
  }

  async getUserByUsername(username: string): Promise<Users | null> {
    try {
      const user = await dbMssql('users').where({ username }).first();
      return user || null;
    } catch (error) {
      console.error('Error fetching user by username:', error);
      throw new Error('Database query failed');
    }
  }

  async fetchKaryawanByUserId(userId: number): Promise<any> {
    try {
      const karyawan = await dbMssql('karyawan')
        .select('karyawan.*', 'c.nama as cabang_nama')
        .leftJoin('users', 'users.karyawan_id', 'karyawan.id')
        .leftJoin('cabang as c', 'c.id', 'karyawan.cabang_id')
        .where('users.id', userId)
        .first();

      return karyawan || null;
    } catch (error) {
      console.error('Error fetching karyawan by user ID:', error);
      throw new Error('Database query failed');
    }
  }
  async fetchUserRolesAndAbilities(
    userId: number,
    trx,
  ): Promise<UserRoleAbilities> {
    const roles = await trx('userrole')
      .where({ user_id: userId })
      .pluck('role_id');

    if (roles.length === 0) {
      return { roles: [], abilities: [] };
    }

    const userAbilities = await trx('useracl')
      .join('acos', 'useracl.aco_id', 'acos.id')
      .where('useracl.user_id', userId)
      .select({
        id: 'acos.id',
        method: 'acos.method',
        class: 'acos.class',
      })
      .distinct('acos.id');

    const roleAbilities = await trx('acl')
      .join('acos', 'acl.aco_id', 'acos.id')
      .whereIn('acl.role_id', roles)
      .select({
        id: 'acos.id',
        method: 'acos.method',
        class: 'acos.class',
      })
      .distinct('acos.id');

    // Gabungkan kedua array dan pastikan id yang dihasilkan berupa nilai tunggal.
    const allAbilities = [
      ...userAbilities.map((ability) => ({
        id: Array.isArray(ability.id) ? ability.id[0] : ability.id,
        action: ability.method,
        subject: ability.class,
      })),
      ...roleAbilities.map((ability) => ({
        id: Array.isArray(ability.id) ? ability.id[0] : ability.id,
        action: ability.method,
        subject: ability.class,
      })),
    ];

    // Gunakan Map untuk menghilangkan duplikat berdasarkan id.
    const uniqueAbilities = [
      ...new Map(allAbilities.map((ability) => [ability.id, ability])).values(),
    ];

    return {
      roles,
      abilities: uniqueAbilities,
    };
  }
  async fetchUserRolesAndUserAcl(
    userId: number,
    trx: any,
  ): Promise<UserRoleAbilities> {
    const roles = await trx('userrole')
      .where({ user_id: userId })
      .pluck('role_id');

    if (roles.length === 0) {
      return { roles: [], abilities: [] };
    }

    const userAbilities = await trx('useracl')
      .join('acos', 'useracl.aco_id', 'acos.id')
      .where('useracl.user_id', userId)
      .select({
        id: 'acos.id',
        method: 'acos.method',
        class: 'acos.class',
      })
      .distinct('acos.id');

    // Gabungkan kedua array dan pastikan id yang dihasilkan berupa nilai tunggal.
    const allAbilities = [
      ...userAbilities.map((ability) => ({
        id: Array.isArray(ability.id) ? ability.id[0] : ability.id,
        action: ability.method,
        subject: ability.class,
      })),
    ];

    // Gunakan Map untuk menghilangkan duplikat berdasarkan id.
    const uniqueAbilities = [
      ...new Map(allAbilities.map((ability) => [ability.id, ability])).values(),
    ];

    return {
      roles,
      abilities: uniqueAbilities,
    };
  }

  checkAccessRecursively = (item: any, abilities: any[]): boolean => {
    return abilities.some((ability: any) => {
      const subject = ability.subject?.toLowerCase() || '';
      const url = item.url?.toLowerCase() || '';
      const title = item.title?.toLowerCase() || '';

      const isSubjectMatching = subject === title || subject === url;
      const isActionMatching = ability.action === 'GET';

      if (isSubjectMatching && isActionMatching) {
        return true;
      }

      if (item.items && item.items.length > 0) {
        return item.items.some((subItem: any) =>
          this.checkAccessRecursively(subItem, abilities),
        );
      }

      return false;
    });
  };

  buildMenuString = (menuItems: any[], abilities: any[]): string => {
    let menuHtml = '';

    const processMenuItem = (item: any): string => {
      if (this.checkAccessRecursively(item, abilities)) {
        let itemHtml = '';

        if (item.items && item.items.length > 0) {
          itemHtml += `<Collapsible asChild defaultOpen={true} open={isMenuOpen('${item.title}')} className="group/collapsible text-sm my-1"><SidebarMenuItem><CollapsibleTrigger asChild><SidebarMenuButton className="text-sm" tooltip="${item.title}" onClick={()=>handleToggle('${item.title}')}><Icons name="${item.icon}" className="icon-white" /><p className="break-words text-sm">${item.title}</p><ChevronRight className={\`ml-auto transform transition-transform duration-300 ease-in-out \${isMenuOpen('${item.title}') ? 'rotate-90' : ''}\`} /></SidebarMenuButton></CollapsibleTrigger><CollapsibleContent><SidebarMenuSub>${this.buildMenuString(item.items, abilities)}</SidebarMenuSub></CollapsibleContent></SidebarMenuItem></Collapsible>`;
        } else {
          itemHtml += `<SidebarMenuSubItem onMouseEnter={() => setHoveredItemId('${item.title}')} onMouseLeave={() => setHoveredItemId(null)}><SidebarMenuSubButton asChild isActive={activePath==="/dashboard/${item.url}"}><Link prefetch={true} href="/dashboard/${item.url}" className="py-4"><Icons name="${item.icon}" className={ hoveredItemId === '${item.title}' || activePath === "/dashboard/${item.url}" ? 'icon-white text-white' : 'icon-white text-white'}/><p className="break-words text-sm">${item.title}</p></Link></SidebarMenuSubButton></SidebarMenuSubItem>`;
        }
        return itemHtml.trim();
      }
      return '';
    };

    menuItems.forEach((item) => {
      menuHtml += processMenuItem(item);
    });

    return menuHtml.replace(/\s+/g, ' ').trim();
  };
  async getDataMenuSidebar(trx: any) {
    try {
      const result = await trx
        .select(
          'menus.id',
          'menus.title',
          trx.raw(
            `CASE WHEN acos.method = 'GET' THEN LOWER(acos.class) ELSE NULL END AS url`,
          ),
          'menus.icon',
          'menus.isActive',
          'menus.parentId',
          'menus.[order]',
        )
        .from('menus')
        .leftJoin('acos', 'menus.aco_id', 'acos.id')
        .orderBy('menus.parentId')
        .orderBy('menus.[order]');

      const formattedMenus = this.formatMenus(result);
      return formattedMenus;
    } catch (error) {
      console.error('Error fetching menu sidebar data:', error);
      throw new Error('Failed to fetch menu sidebar data');
    }
  }

  formatMenus(rawData: any[]): Menu[] {
    const map: { [key: number]: Menu } = {};
    const roots: Menu[] = [];

    rawData.forEach((menu: any) => {
      map[menu.id] = {
        id: menu.id,
        title: menu.title,
        url: menu.url || '',
        icon: menu.icon || '',
        isActive: menu.isActive === true,
        order: menu.order || 0,
        parentId: menu.parentId || 0,
        items: [],
      };
    });

    rawData.forEach((menu: any) => {
      if (menu.parentId === 0 || menu.parentId === null) {
        roots.push(map[menu.id]);
      } else if (map[menu.parentId]) {
        map[menu.parentId].items.push(map[menu.id]);
      }
    });

    const sortItems = (items: Menu[]): Menu[] => {
      return items
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          ...item,
          items: sortItems(item.items),
        }));
    };

    return sortItems(roots);
  }
  async compressImageKaryawan(file: Express.Multer.File): Promise<string> {
    const outputDir = path.join(process.cwd(), 'uploads/compress');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const extname = path.extname(file.originalname);
    const timestamp = Date.now();
    const combinedName = `${timestamp}${extname}`;
    // Nama file untuk medium (disimpan dengan nama medium_)
    const mediumName = `medium_${timestamp}${extname}`;
    const mediumPath = path.join(outputDir, mediumName);

    // Nama file untuk thumbnail (disimpan dengan nama small_)
    const thumbnailName = `small_${timestamp}${extname}`;
    const thumbnailPath = path.join(outputDir, thumbnailName);

    const format = mimeToSharpFormat[file.mimetype]; // Pastikan mimeToSharpFormat didefinisikan dengan benar

    // Menyimpan gambar medium dengan ukuran asli (tanpa resize)
    fs.writeFileSync(mediumPath, file.buffer);

    // Resize gambar untuk thumbnail (100px lebar)
    const thumbnailBuffer = await sharp(file.buffer)
      .resize(100) // Resize image to 100px width for thumbnail
      .toFormat(format) // Convert image to appropriate format
      .toBuffer();
    fs.writeFileSync(thumbnailPath, thumbnailBuffer); // Menyimpan gambar thumbnail

    return combinedName; // Return nama file asli, bukan nama medium atau small
  }

  async compressImage(file: Express.Multer.File): Promise<string> {
    const outputDir = path.join(process.cwd(), 'uploads/compress');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const extname = path.extname(file.originalname);
    const fileName = `medium_${Date.now()}${extname}`; // Menambahkan 'medium_' sebelum nama file
    const filePath = path.join(outputDir, fileName);

    const format = mimeToSharpFormat[file.mimetype]; // Pastikan mimeToSharpFormat didefinisikan dengan benar
    const compressedImageBuffer = await sharp(file.buffer)
      .resize(1200) // Resize image to 1200px width
      .toFormat(format) // Convert image to appropriate format
      .toBuffer();

    fs.writeFileSync(filePath, compressedImageBuffer);
    return fileName; // Return the name of the compressed file
  }
}

export function parseDDMMYYYY(dateString: string): Date | null {
  const [day, month, year] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return isNaN(date.getTime()) ? null : date;
}
// Fungsi validasi dinamis untuk cek apakah data sudah ada berdasarkan kolom tertentu
export async function isRecordExist(
  column: string,
  value: string,
  table: string,
  excludeId?: number,
): Promise<boolean> {
  const existingRecordQuery = dbMssql(table) // Ganti dengan query builder yang Anda pakai, misalnya knex.js
    .select('*')
    .where(column, value); // Cek jika ada username dengan value yang diberikan

  // Jika ada excludeId, kita exclude pengecekan pada record dengan id tersebut
  if (excludeId) {
    existingRecordQuery.whereNot('id', excludeId);
  }

  const existingRecord = await existingRecordQuery.first(); // Mendapatkan satu data saja
  return existingRecord !== undefined; // Jika ada, return true
}
export function convertToDateFormat(dateString) {
  const [day, month, year] = dateString.split('-');
  return `${year}/${month}/${day}`;
}
export function formatEmailDate(input: string | Date): string {
  let date: Date;

  if (typeof input === 'string') {
    // Cek apakah formatnya DD-MM-YYYY (ada dua strip dan panjang tiap segmen 2–4 digit)
    const parts = input.split('-');
    if (
      parts.length === 3 &&
      parts[0].length === 2 &&
      parts[1].length === 2 &&
      parts[2].length === 4
    ) {
      // parts = [DD, MM, YYYY]
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JavaScript bulan: 0–11
      const year = parseInt(parts[2], 10);
      date = new Date(year, month, day);
    } else {
      // fallback ke parser bawaan (misalnya ISO 2025-06-03)
      date = new Date(input);
    }
  } else {
    date = input;
  }

  if (isNaN(date.getTime())) {
    // Kalau tetap invalid, kembalikan string kosong atau pesan error sederhana
    return '–– INVALID DATE ––';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('id-ID', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}
export function addcslashes(str: string, chars: string): string {
  const escapedChars = chars
    .split('')
    .map((char) => `\\${char}`)
    .join('');
  const regex = new RegExp(`[${escapedChars}]`, 'g');
  return str.replace(regex, '\\$&');
}
