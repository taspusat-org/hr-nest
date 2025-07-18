import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Query,
  Res,
  UsePipes,
  Put,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JenisizinService } from './jenisizin.service';
import { AuthGuard } from '../auth/auth.guard';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { isRecordExist } from 'src/utils/utils.service';
import { dbMssql } from 'src/common/utils/db';
import { Response } from 'express';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import {
  UpdateJeniscatatanDto,
  UpdateJeniscatatanSchema,
} from '../jeniscatatan/dto/update-jeniscatatan.dto';
import * as fs from 'fs';
import {
  CreateJenisIzinDto,
  CreateJenisIzinSchema,
} from './dto/create-jenisizin.dto';

@Controller('jenisizin')
export class JenisizinController {
  constructor(private readonly jenisizinService: JenisizinService) {}
  @UseGuards(AuthGuard)
  @Post()
  //@JENISCATATAN
  async create(
    @Body(new ZodValidationPipe(CreateJenisIzinSchema))
    request: CreateJenisIzinDto,
    @Req() req,
  ) {
    const namajeniscatatanexists = await isRecordExist(
      'nama',
      request.nama,
      'jenisizin',
    );
    if (namajeniscatatanexists) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Nama Jenis Izin sudah ada',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const trx = await dbMssql.transaction();
    try {
      const modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.jenisizinService.create(
        request,
        trx,
        modifiedby,
      );

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new Error(`Error creating jenis catatan: ${error.message}`);
    }
  }

  @Post('report-byselect')
  //@JENISCATATAN
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.jenisizinService.findAllByIds(ids);
  }

  @Get('/export')
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.jenisizinService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_cabang.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Post('export-byselect')
  //@JENISCATATAN
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    // return this.jenisizinService.findAllByIds(ids);
  }

  @Get()
  //@JENISCATATAN
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Query() query: FindAllDto) {
    const { search, page, limit, sortBy, sortDirection, isLookUp, ...filters } =
      query;

    const sort = {
      sortBy: sortBy || 'nama',
      sortDirection: sortDirection,
    };

    // Jika limit 0 atau tidak ada, maka tidak ada pagination
    const pagination = {
      page: page || 1, // Jika page tidak ada, set ke 1
      limit: limit === 0 || !limit ? undefined : limit, // Jika limit 0, tidak ada pagination
    };

    const params: FindAllParams = {
      search,
      filters,
      pagination,
      isLookUp: isLookUp === 'true',
      sort,
    };
    return this.jenisizinService.findAll(params);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jenisizinService.findOne(+id);
  }
  @UseGuards(AuthGuard)
  @Put(':id')
  //@JENISCATATAN
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateJeniscatatanSchema))
    request: UpdateJeniscatatanDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      req.modifiedby = req.user?.user?.username || 'unknown';
      const { statusaktifnama, ...dataToUpdate } = request;
      const result = await this.jenisizinService.update(+id, dataToUpdate, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating jenis catatan in controller:', error);
      throw new Error('Failed to update jenis catatan');
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  //@JENISCATATAN
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.jenisizinService.delete(
        +id,
        trx,
        req.user?.user?.username,
      );

      if (result.status === 404) {
        throw new NotFoundException(result.message);
      }

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error deleting menu in controller:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to delete jenis catatan');
    }
  }
}
