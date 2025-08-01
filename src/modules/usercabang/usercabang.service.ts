import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { dbMssql } from 'src/common/utils/db';
import { UtilsService } from 'src/utils/utils.service';

@Injectable()
export class UsercabangService {
  constructor(private readonly utilsService: UtilsService) {}
  private readonly logger = new Logger(UsercabangService.name);
  create(createUserroleDto: any) {
    return 'This action adds a new usercabang';
  }

  async findAll(userId: number) {
    this.logger.log(`Fetching ACL for role ID: ${userId}`);

    try {
      const result = await dbMssql('usercabang as ur')
        .select(['ur.user_id as userId', 'r.*'])
        .leftJoin('cabang as r', 'ur.cabang_id', 'r.id')
        .where('ur.user_id', userId);
      if (!result.length) {
        this.logger.warn(`No ACL found for user ID: ${userId}`);
        return {
          status: false,
          message: 'No ACL data found for the given user ID',
          data: [],
        };
      }

      return { data: result };
    } catch (error) {
      this.logger.error('Error fetching cabang ACL', error.stack);
      throw new Error('Failed to fetch cabang ACL');
    }
  }

  async update(
    id: number,
    updateUserroleDto: any,
    modifiedBy: string,
    trx: any,
  ) {
    try {
      const { cabangIds } = updateUserroleDto;

      // Jika cabangIds null, kita asumsikan tidak ada role yang diberikan.
      // Contoh: hapus semua role user atau set cabangIds ke array kosong.
      if (!cabangIds) {
        await trx('usercabang').where('user_id', id).delete();
        return { status: true, message: 'User roles updated successfully' };
      }

      // Loop untuk setiap roleId yang diterima
      for (const roleId of cabangIds) {
        const existingRole = await trx('usercabang')
          .where('user_id', id)
          .andWhere('cabang_id', roleId)
          .first();

        if (existingRole) {
          await trx('usercabang')
            .where('user_id', id)
            .andWhere('cabang_id', roleId)
            .update({
              modifiedby: modifiedBy,
              updated_at: dbMssql.fn.now(),
            });
        } else {
          await trx('usercabang').insert({
            user_id: id,
            cabang_id: roleId,
            modifiedby: modifiedBy,
            created_at: dbMssql.fn.now(),
            updated_at: dbMssql.fn.now(),
          });
        }
      }

      // Hapus role yang tidak termasuk dalam cabangIds
      await trx('usercabang')
        .where('user_id', id)
        .whereNotIn('cabang_id', cabangIds)
        .delete();
      const { abilities } = await this.utilsService.fetchUserRolesAndAbilities(
        id,
        trx,
      );

      // Update menu after roles and ACL updates
      const menuData = await this.utilsService.getDataMenuSidebar(trx);
      const menuString = this.utilsService.buildMenuString(menuData, abilities);

      await trx('users').update({ menu: menuString }).where('id', id);
      return { status: true, message: 'User roles updated successfully' };
    } catch (error) {
      console.error('Error updating user roles in service:', error);
      throw new InternalServerErrorException('Failed to update user roles');
    }
  }

  remove(id: number) {
    return `This action removes a #${id} usercabang`;
  }
}
