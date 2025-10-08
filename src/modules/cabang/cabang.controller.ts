import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Res,
  UsePipes,
  Query,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CabangService } from './cabang.service';
import { CreateCabangDto, CreateCabangSchema } from './dto/create-cabang.dto';
import { UpdateCabangDto, UpdateCabangSchema } from './dto/update-cabang.dto';
import { Response } from 'express';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';
import { request } from 'http';
import * as fs from 'fs';
import { isRecordExist } from 'src/utils/utils.service';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';

@Controller('cabang')
export class CabangController {
  constructor(private readonly cabangService: CabangService) {}

  @UseGuards(AuthGuard)
  @Post()
  //@CABANG
  async create(
    @Body(new ZodValidationPipe(CreateCabangSchema)) request: CreateCabangDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    const kodecabangexits = await isRecordExist(
      'kodecabang',
      request.kodecabang,
      'cabang',
      undefined,
      trx,
    );
    if (kodecabangexits) {
      await trx.rollback();
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Kode Cabang sudah ada', // Custom message
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      request.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.cabangService.create(request, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new Error(`Error creating cabang: ${error.message}`);
    }
  }

  @Post('report-byselect')
  //@CABANG
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.cabangService.findAllByIds(ids);
  }

  @Get('/export')
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.cabangService.exportToExcel(data);

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

  @Post('/export-byselect')
  //@CABANG
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.cabangService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.cabangService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_role.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Get()
  //@CABANG
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Query() query: FindAllDto) {
    const { search, page, limit, sortBy, sortDirection, isLookUp, ...filters } =
      query;

    // Menangani fallback untuk page dan limit
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
      isLookUp: isLookUp === 'true', // Convert isLookUp to boolean
      sort,
    };
    return this.cabangService.findAll(params);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cabangService.findOne(+id);
  }

  @Get('check/:id')
  checkCabang(@Param('id') id: string) {
    return this.cabangService.checkRole(+id);
  }

  @UseGuards(AuthGuard)
  @Put(':id')

  //@CABANG
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCabangSchema)) request: UpdateCabangDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    const kodecabangexits = await isRecordExist(
      'kodecabang',
      request.kodecabang,
      'cabang',
      Number(+id),
      trx,
    );
    if (kodecabangexits) {
      await trx.rollback();
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Kode Cabang sudah ada', // Custom message
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      request.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.cabangService.update(+id, request, trx);

      await trx.commit();
      return result;
    } catch (error) {
      console.error('Error updating cabang in controller:', error);
      await trx.rollback();
      throw new Error('Failed to update cabang');
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.cabangService.remove(
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
