import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  Query,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { KaryawanResignService } from './karyawan_resign.service';
import { CreateKaryawanResignDto } from './dto/create-karyawan_resign.dto';
import { UpdateKaryawanResignDto } from './dto/update-karyawan_resign.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { AuthGuard } from '../auth/auth.guard';
import { CreateKaryawanDto } from '../karyawan/dto/create-karyawan.dto';
import { dbMssql } from 'src/common/utils/db';
import { UtilsService } from 'src/utils/utils.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import * as fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';
@Controller('karyawan-resign')
export class KaryawanResignController {
  constructor(
    private readonly karyawanResignService: KaryawanResignService,
    private readonly utilsService: UtilsService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @Get()
  //@KARYAWAN-RESIGN
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Req() req, @Query() query: FindAllDto) {
    const {
      search,
      page,
      limit,
      sortBy,
      sortDirection,
      isLookUp,
      ...filters
    }: { [key: string]: any } = query;
    const role_id = req.user.user.role_id;
    if (!role_id.includes('1')) {
      filters.cabang_id = req.user.cabang_id;
    }

    const sortParams = {
      sortBy: sortBy || 'namakaryawan',
      sortDirection: sortDirection || 'asc',
    };

    const pagination = {
      page: page || 1,
      limit: limit === 0 || !limit ? undefined : limit,
    };

    const params: FindAllParams = {
      search,
      filters,
      pagination,
      isLookUp: isLookUp === 'true',
      sort: sortParams as { sortBy: string; sortDirection: 'asc' | 'desc' },
    };

    return this.karyawanResignService.findAll(params);
  }
  @Get('/export')
  @UseGuards(AuthGuard)
  // @KARYAWAN
  async exportToExcel(@Req() req, @Query() params: any, @Res() res: Response) {
    try {
      // Menambahkan parameter limit dengan nilai default 0
      const limit = params.limit ? parseInt(params.limit, 10) : 0;

      // Menambahkan limit ke dalam params
      params.limit = limit;

      const { data } = await this.findAll(req, params);
      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.karyawanResignService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_karyawan_resign.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Post('/export-byselect')
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.karyawanResignService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.karyawanResignService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_karyawan.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanResignService.findOne(+id);
  }

  // @UseGuards(AuthGuard)
  // @Post()
  // //@KARYAWAN
  // async create(@Body() data: any, @Req() req) {
  //   // const trx = await dbMssql.transaction();
  //   try {
  //     const result = await this.karyawanResignService.create(data);
  //     // await trx.commit();
  //     return result;
  //   } catch (error) {
  //     // await trx.rollback();
  //     console.error('Error:', error);
  //     throw new Error(`Error creating parameter: ${error.message}`);
  //   }
  // }

  @Post()
  @UseGuards(AuthGuard)
  async create(@Body() data: any, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const timeoutDuration = 10000; // Timeout dalam milidetik

      const kodeCabang = req.user.cabang_id;
      const cabangCodes: string[] = [];

      if (kodeCabang == 26) {
        cabangCodes.push('26');
      } else {
        cabangCodes.push(String(kodeCabang));
      }
      // Kirim request ke RabbitMQ untuk setiap cabang
      const requestPromises = cabangCodes.map((cabangCode) =>
        Promise.race([
          this.rabbitmqService.client
            .send({ cmd: `${cabangCode}` }, { ...data, kodeCabang: cabangCode })
            .toPromise(),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Timeout: Tidak ada response dari cabang ${cabangCode}`,
                  ),
                ),
              timeoutDuration,
            ),
          ),
        ]),
      );

      // Tunggu sampai semua request selesai
      const responses = await Promise.all(requestPromises);

      // Jika ada response yang gagal, lemparkan error dan rollback transaksi
      for (const response of responses) {
        if (!response || response.status !== 'success') {
          const errorMessage =
            response?.message ||
            'Gagal menonaktifkan akun di salah satu cabang';
          throw new Error(errorMessage);
        }
      }
      data.modifiedby = req.user?.user?.username || 'unknown';
      const result = await this.karyawanResignService.create(data, trx);

      // Jika semuanya sukses, commit transaksi
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error:', error);

      // Return a better-formatted error response
      throw new HttpException(
        {
          status: 'error',
          message: error.message || 'Something went wrong',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.karyawanResignService.findAllByIds(ids);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanResignService.remove(+id);
  }
}
