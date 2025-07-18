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
  UsePipes,
  Query,
  InternalServerErrorException,
  NotFoundException,
  Res,
  Put,
} from '@nestjs/common';
import { DaftaremailService } from './daftaremail.service';
import { CreateDaftaremailDto } from './dto/create-daftaremail.dto';
import { UpdateDaftaremailDto } from './dto/update-daftaremail.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { dbMssql } from 'src/common/utils/db';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { Response } from 'express';
import * as fs from 'fs';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';

@Controller('daftaremail')
export class DaftaremailController {
  constructor(private readonly daftaremailService: DaftaremailService) {}

  @UseGuards(AuthGuard)
  @Post()

  //@DAFTAR-EMAIL
  async create(@Body() data: any, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const modifiedby = req.user?.user?.username || 'unknown';
      const result = await this.daftaremailService.create(
        data,
        trx,
        modifiedby,
      );

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new Error(`Error creating parameter: ${error.message}`);
    }
  }

  @Get()
  //@DAFTAR-EMAIL
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

    return this.daftaremailService.findAll(params);
  }

  @Get('/export')
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.daftaremailService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_daftaremail.xlsx"',
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
      const data = await this.daftaremailService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.daftaremailService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_daftaremail.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any, @Req() req) {
    const trx = await dbMssql.transaction();

    try {
      data.modifiedby = req.user?.user?.username || 'unknown';
      const { lookupNama, lookupNamaKaryawan, text, ...dataToUpdate } = data;
      const result = await this.daftaremailService.update(
        +id,
        dataToUpdate,
        trx,
      );

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating parameter in controller:', error);
      throw new Error('Failed to update parameter');
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.daftaremailService.delete(
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
      const result = await this.daftaremailService.getById(+id, trx);

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
  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.daftaremailService.findAllByIds(ids);
  }
}
