import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  UsePipes,
  Query,
  Res,
  Put,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { MutasiService } from './mutasi.service';
import { CreateMutasiDto } from './dto/create-mutasi.dto';
import { UpdateMutasiDto } from './dto/update-mutasi.dto';
import { dbMssql } from 'src/common/utils/db';
import { AuthGuard } from '../auth/auth.guard';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { Response } from 'express';
import * as fs from 'fs';

@Controller('mutasi')
export class MutasiController {
  constructor(private readonly mutasiService: MutasiService) {}

  @UseGuards(AuthGuard)
  @Post()
  //@MUTASI
  async create(@Body() data: any, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const modifiedby = req.user?.user?.username || 'unknown';
      const result = await this.mutasiService.create(data, trx, modifiedby);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new Error(`Error creating parameter: ${error.message}`);
    }
  }

  @Get()
  //@MUTASI
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Query() query: FindAllDto) {
    const { search, page, limit, sortBy, sortDirection, isLookUp, ...filters } =
      query;

    const sortParams = {
      sortBy: sortBy || 'karyawan_nama',
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

    return this.mutasiService.findAll(params);
  }

  @Get('/export')
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.mutasiService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_karyawan_mutasi.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.mutasiService.findAllByIds(ids);
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      data.modifiedby = req.user?.user?.username || 'unknown';
      const { lookupNama, lookupNamaKaryawan, ...dataToUpdate } = data;
      const result = await this.mutasiService.update(+id, dataToUpdate, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating parameter in controller:', error);
      throw new Error('Failed to update parameter');
    }
  }
  @Post('/export-byselect')
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.mutasiService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.mutasiService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_menu.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @UseGuards(AuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.mutasiService.delete(
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

      throw new InternalServerErrorException('Failed to delete menu');
    }
  }
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.mutasiService.getById(+id, trx);

      if (!result) {
        await trx.commit();
        return {
          status: '200',
          message: 'Data not found',
        };
      }

      await trx.commit();
      return result;
    } catch (error) {
      console.error('Error fetching data by id:', error);

      await trx.rollback();
      throw new Error('Failed to fetch data by id');
    }
  }
}
