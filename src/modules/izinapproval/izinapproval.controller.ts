import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IzinapprovalService } from './izinapproval.service';
import { CreateIzinapprovalDto } from './dto/create-izinapproval.dto';
import { UpdateIzinapprovalDto } from './dto/update-izinapproval.dto';
import { dbMssql } from 'src/common/utils/db';

@Controller('izinapproval')
export class IzinapprovalController {
  constructor(private readonly izinapprovalService: IzinapprovalService) {}
  @Put('approve')
  async updateStatusApproval(
    @Body() body: { izinId: number; karyawanId: number },
  ) {
    const { izinId, karyawanId } = body;
    const trx = await dbMssql.transaction();
    const existing = await trx('izinapproval')
      .select('statusapproval')
      .where('izin_id', izinId)
      .andWhere('karyawan_id', karyawanId)
      .first();

    if (!existing) {
      await trx.rollback();
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Kalau sudah DISETUJUI atau sudah REJECTED, lempar error sesuai kondisi
    if (existing.statusapproval === 151) {
      await trx.rollback();
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'IZIN SUDAH DI SETUJUI',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing.statusapproval === 152) {
      await trx.rollback();
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'IZIN SUDAH DI TOLAK',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing.statusapproval === 153) {
      await trx.rollback();
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'IZIN SUDAH DI BATALKAN',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const updated = await this.izinapprovalService.approve(
        izinId,
        karyawanId,
        trx,
      );
      await trx.commit();
      return {
        message: `Status approval for izin_id ${izinId} and karyawan_id ${karyawanId} updated successfully`,
        updated,
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
  @Put('reject')
  async updateReject(@Body() body: { izinId: number; karyawanId: number }) {
    const { izinId, karyawanId } = body;
    const trx = await dbMssql.transaction();
    try {
      const updated = await this.izinapprovalService.reject(
        izinId,
        karyawanId,
        trx,
      );
      await trx.commit();
      return {
        message: `Status approval for izin_id ${izinId} and karyawan_id ${karyawanId} updated successfully`,
        updated,
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
  @Get(':id')
  //@APPROVAL-IZIN
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.izinapprovalService.findById(+id, trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateIzinapprovalDto: UpdateIzinapprovalDto,
  ) {
    return this.izinapprovalService.update(+id, updateIzinapprovalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.izinapprovalService.remove(+id);
  }
}
