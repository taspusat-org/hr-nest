import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Req,
  UseGuards,
  NotFoundException,
  InternalServerErrorException,
  Res,
  UsePipes,
  Query,
} from '@nestjs/common';
import { ApprovalheaderService } from './approvalheader.service';
import { dbMssql } from 'src/common/utils/db';
import { AuthGuard } from '../auth/auth.guard';
import { CreateApprovalHeaderDto } from './dto/create-approvalheader.dto';
import { Response } from 'express';
import * as fs from 'fs';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('approvalheader')
export class ApprovalheaderController {
  constructor(private readonly approvalheaderService: ApprovalheaderService) {}

  @UseGuards(AuthGuard)
  @Post()
  //@USER-APPROVAL
  async create(@Body() createData: CreateApprovalHeaderDto, @Req() req) {
    const trx = await dbMssql.transaction(); // Create a transaction

    try {
      const modifiedby = req.user?.user?.username; // Assuming user is available in req.user

      const result = await this.approvalheaderService.create(
        createData,
        trx,
        modifiedby,
      );

      await trx.commit();

      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  @Get()
  //@USER-APPROVAL
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
    filters.cabang_id = req.user.cabang_id;

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

    return this.approvalheaderService.findAll(params);
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  //@USER-APPROVAL
  async update(
    @Param('id') id: number,
    @Body() updateData: CreateApprovalHeaderDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      const modifiedby = req.user?.user?.username; // Assuming user is available in req.user

      const result = await this.approvalheaderService.update(
        id,
        updateData,
        trx,
        modifiedby,
      );

      await trx.commit();

      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  //@USER-APPROVAL
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const modifiedby = req.user?.user?.username; // Assuming user is available in req.user
      const result = await this.approvalheaderService.delete(
        +id,
        trx,
        modifiedby,
      );

      if (result.status === 404) {
        throw new NotFoundException(result.message);
      }

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error deleting :', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to delete');
    }
  }
  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.approvalheaderService.findAllByIds(ids);
  }

  @Post('/export-byselect')
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.approvalheaderService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.approvalheaderService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_error.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Get('/export')
  @UseGuards(AuthGuard)
  async exportToExcel(@Req() req, @Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(req, params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.approvalheaderService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_approvalheader.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
}
