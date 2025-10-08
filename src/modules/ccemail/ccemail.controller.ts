import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  UseGuards,
  Req,
  NotFoundException,
  InternalServerErrorException,
  Put,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CcemailService } from './ccemail.service';
import {
  CreateCcemailDto,
  CreateCcemailSchema,
} from './dto/create-ccemail.dto';
import {
  UpdateCcemailDto,
  UpdateCcemailSchema,
} from './dto/update-ccemail.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';
import * as fs from 'fs';
import { Response } from 'express';
import { isRecordExist } from 'src/utils/utils.service';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';

@Controller('ccemail')
export class CcemailController {
  constructor(private readonly ccemailService: CcemailService) {}

  @UseGuards(AuthGuard)
  @Post()

  //@CC-EMAIL
  async create(
    @Body(new ZodValidationPipe(CreateCcemailSchema)) data: CreateCcemailDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();

    try {
      const emailExist = await isRecordExist(
        'email',
        data.email,
        'ccemail',
        undefined,
        trx,
      );

      if (emailExist) {
        await trx.rollback();
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Email sudah ada',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      data.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.ccemailService.create(data, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating parameter in controller:', error);

      // Ensure any other errors get caught and returned
      if (error instanceof HttpException) {
        throw error; // If it's already a HttpException, rethrow it
      }

      // Generic error handling, if something unexpected happens
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to create ccemail',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  //@CC-EMAIL
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

    return this.ccemailService.findAll(params);
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCcemailSchema)) data: UpdateCcemailDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      const emailExist = await isRecordExist(
        'email',
        data.email,
        'ccemail',
        Number(id),
        trx,
      );
      if (emailExist) {
        await trx.rollback();
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Email sudah ada',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      data.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.ccemailService.update(+id, data, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating cc email in controller:', error);
      // Ensure any other errors get caught and returned
      if (error instanceof HttpException) {
        throw error; // If it's already a HttpException, rethrow it
      }

      // Generic error handling, if something unexpected happens
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update ccemail',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  //@CC-EMAIL
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.ccemailService.delete(
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
      console.error('Error deleting data in controller: ', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to delete data');
    }
  }

  @Get('/export')
  async exportToExcel(@Query() query: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(query);

      if (!Array.isArray(data)) {
        // Cek apakah data ada dan merupakan array
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.ccemailService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_ccemail.xlsx"',
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
      const data = await this.ccemailService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.ccemailService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_ccemail.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.ccemailService.findAllByIds(ids);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    // return this.ccemailService.findOne(+id);
  }
}
