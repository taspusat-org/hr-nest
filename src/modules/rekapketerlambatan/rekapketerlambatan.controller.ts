import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';
import { RekapketerlambatanService } from './rekapketerlambatan.service';
import { CreateRekapketerlambatanDto } from './dto/create-rekapketerlambatan.dto';
import { UpdateRekapketerlambatanDto } from './dto/update-rekapketerlambatan.dto';
import { dbMssql } from 'src/common/utils/db';
import { Response } from 'express';
import * as fs from 'fs';
@Controller('rekapketerlambatan')
export class RekapketerlambatanController {
  constructor(
    private readonly rekapketerlambatanService: RekapketerlambatanService,
  ) {}
  @Get()
  async getRekapKeterlambatan(
    @Query()
    query: {
      pidcabang: number;
      tanggalDari: string;
      tanggalSampai: string;
      idabsenFrom: string; // optional
      idabsenTo: string; // optional
      search: string; // optional: for searching by namakaryawan
      sortBy: string; // optional: for sorting by specific column
      sortDirection: 'asc' | 'desc'; // optional: for sorting direction
    },
  ) {
    const {
      pidcabang,
      tanggalDari,
      tanggalSampai,
      idabsenFrom,
      idabsenTo,
      search,
      sortBy = 'tgl', // Default to 'namakaryawan' if no sorting column is provided
      sortDirection = 'asc', // Default to 'asc' if no sorting direction is provided
    } = query;

    // Start the transaction
    const trx = await dbMssql.transaction();
    const updatedIdAbsenFrom = idabsenFrom === 'null' ? '' : idabsenFrom;
    const updatedIdAbsenTo = idabsenTo === 'null' ? '' : idabsenTo;
    try {
      // Call the service method to process the data
      const result = await this.rekapketerlambatanService.rekapKeterlambatan(
        tanggalDari,
        tanggalSampai,
        pidcabang,
        updatedIdAbsenFrom,
        updatedIdAbsenTo,
        search,
        sortBy,
        sortDirection,
        trx,
      );

      // Commit the transaction if everything goes well
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback the transaction in case of error
      await trx.rollback();
      throw error; // Re-throw the error to handle it further up the stack
    }
  }
  @Get('/export')
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const data = await this.getRekapKeterlambatan(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath =
        await this.rekapketerlambatanService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_rekapitulasikehadiran.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Post()
  create(@Body() createRekapketerlambatanDto: CreateRekapketerlambatanDto) {
    return this.rekapketerlambatanService.create(createRekapketerlambatanDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rekapketerlambatanService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRekapketerlambatanDto: UpdateRekapketerlambatanDto,
  ) {
    return this.rekapketerlambatanService.update(
      +id,
      updateRekapketerlambatanDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rekapketerlambatanService.remove(+id);
  }
}
