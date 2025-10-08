import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UsePipes,
  Query,
  Req,
  Put,
  NotFoundException,
  InternalServerErrorException,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JabatanService } from './jabatan.service';
import {
  CreateJabatanDto,
  CreateJabatanSchema,
} from './dto/create-jabatan.dto';
import {
  UpdateJabatanDto,
  UpdateJabatanSchema,
} from './dto/update-jabatan.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { dbMssql } from 'src/common/utils/db';
import { AuthGuard } from '../auth/auth.guard';
import * as fs from 'fs';
import { Response } from 'express';
import { cache } from 'sharp';
import { isRecordExist } from 'src/utils/utils.service';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';

@Controller('jabatan')
export class JabatanController {
  constructor(private readonly jabatanService: JabatanService) {}

  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return await this.jabatanService.findAllByIds(ids);
  }

  @UseGuards(AuthGuard)
  @Post()

  //@Jabatan
  async create(
    @Body(new ZodValidationPipe(CreateJabatanSchema)) data: CreateJabatanDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      const emailExists = await isRecordExist('nama', data.nama, 'jabatan');

      if (emailExists) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'email sudah ada', // Custom message
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      data.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.jabatanService.create(data, trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error creating jabatan in controller:', error);
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to create jabatan',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  //@Jabatan
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Query() query: FindAllDto) {
    const { search, page, limit, sortBy, sortDirection, isLookUp, ...filters } =
      query;
    const sortParams = {
      sortBy: sortBy || 'nama',
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
    return this.jabatanService.findAll(params);
  }

  @UseGuards(AuthGuard)
  @Put(':id')

  //@Jabatan
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateJabatanSchema)) data: UpdateJabatanDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      const emailExists = await isRecordExist(
        'nama',
        data.nama,
        'jabatan',
        Number(id),
        trx,
      );

      if (emailExists) {
        await trx.rollback();
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'email sudah ada', // Custom message
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      data.modifiedby = req.user?.user?.username || 'unknown';
      const { lookupNama, ...dataToUpdate } = data;
      const result = await this.jabatanService.update(+id, dataToUpdate, trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating jabatan in controller:', error);
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update jabatan',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/export')
  //@Jabatan
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(params);
      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.jabatanService.exportToExcel(data);
      const fileStream = fs.createReadStream(tempFilePath);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_jabatan.xlsx"',
      );
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export files');
    }
  }

  @Post('/export-byselect')
  //@Jabatan
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.jabatanService.findAllByIds(ids);
      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }
      const tempFilePath = await this.jabatanService.exportToExcel(data);
      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_jabatan.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.jabatanService.getById(+id, trx);
      if (!result) {
        throw new Error('Data not found');
      }
      await trx.commit();
      return result;
    } catch (error) {
      console.error('Error fetching data by id:', error);
      await trx.rollback();
      throw new Error('Failed to fetch data by id');
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  //@Jabatan
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.jabatanService.delete(
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
      console.error('Error deleting data in controller:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete data');
    }
  }
}
