import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CutiapprovalService } from './cutiapproval.service';
import { CreateCutiapprovalDto } from './dto/create-cutiapproval.dto';
import { UpdateCutiapprovalDto } from './dto/update-cutiapproval.dto';
import { dbMssql } from 'src/common/utils/db';

@Controller('cutiapproval')
export class CutiapprovalController {
  constructor(private readonly cutiapprovalService: CutiapprovalService) {}
  @Put('approve')
  async updateStatusApproval(
    @Body()
    body: {
      cutiId: number;
      karyawanId: number;
      statusnonhitung: string;
    },
  ) {
    const { cutiId, karyawanId, statusnonhitung } = body;

    // 1. Ambil record approval saat ini
    const existing = await dbMssql('cutiapproval')
      .select('statusapproval')
      .where('cuti_id', cutiId)
      .andWhere('karyawan_id', karyawanId)
      .first();

    if (!existing) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Kalau sudah DISETUJUI atau sudah REJECTED, lempar error sesuai kondisi
    if (existing.statusapproval === 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI APPROVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing.statusapproval === 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI TOLAK',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing.statusapproval === 3) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI BATALKAN',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    // 3. Kalau belum, lanjutkan transaksi approve
    const trx = await dbMssql.transaction();
    try {
      const updated = await this.cutiapprovalService.approve(
        cutiId,
        karyawanId,
        statusnonhitung,
        trx,
      );
      await trx.commit();
      return {
        message: `Cuti ${cutiId} karyawan ${karyawanId} berhasil di-approve`,
        updated,
      };
    } catch (error) {
      await trx.rollback();
      throw new HttpException(
        `Error Approve Cuti: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('reject')
  async updateReject(
    @Body()
    body: {
      cutiId: number;
      karyawanId: number;
      alasanpenolakan: string;
    },
  ) {
    const { cutiId, karyawanId, alasanpenolakan } = body;

    // 1. Ambil record approval saat ini
    const existing = await dbMssql('cutiapproval')
      .select('statusapproval')
      .where('cuti_id', cutiId)
      .andWhere('karyawan_id', karyawanId)
      .first();

    if (!existing) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Kalau sudah REJECTED atau sudah DISETUJUI, lempar error
    if (existing.statusapproval === 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DITOLAK',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Kalau belum, lanjutkan transaksi reject
    const trx = await dbMssql.transaction();
    try {
      const updated = await this.cutiapprovalService.reject(
        cutiId,
        karyawanId,
        alasanpenolakan,
        trx,
      );
      await trx.commit();
      return {
        message: `Cuti ${cutiId} karyawan ${karyawanId} berhasil ditolak`,
        updated,
      };
    } catch (error) {
      await trx.rollback();
      throw new HttpException(
        `Error Reject Cuti: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.cutiapprovalService.findByCutiId(+id, trx);
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
    @Body() updateCutiapprovalDto: UpdateCutiapprovalDto,
  ) {
    return this.cutiapprovalService.update(+id, updateCutiapprovalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cutiapprovalService.remove(+id);
  }
}
