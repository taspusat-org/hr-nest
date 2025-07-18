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
import { RekapKehadiranService } from './rekap-kehadiran.service';
import { CreateRekapKehadiranDto } from './dto/create-rekap-kehadiran.dto';
import { UpdateRekapKehadiranDto } from './dto/update-rekap-kehadiran.dto';
import { dbMssql } from 'src/common/utils/db';
import { Response } from 'express';
import * as fs from 'fs';

@Controller('rekap-kehadiran')
export class RekapKehadiranController {
  constructor(private readonly rekapKehadiranService: RekapKehadiranService) {}

  @Post()
  create(@Body() createRekapKehadiranDto: CreateRekapKehadiranDto) {
    return this.rekapKehadiranService.create(createRekapKehadiranDto);
  }

  @Get()
  async getRekapKehadiran(
    @Query()
    query: {
      idabsenFrom: string;
      idabsenTo: string;
      pidcabang: number;
      tanggalDari: string;
      tanggalSampai: string;
      search: string; // optional: for searching by namakaryawan
      sortBy: string; // optional: for sorting by specific column
      sortDirection: 'asc' | 'desc'; // optional: for sorting direction
    },
  ) {
    const {
      idabsenFrom,
      idabsenTo,
      pidcabang,
      tanggalDari,
      tanggalSampai,
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
      const result = await this.rekapKehadiranService.rekapKehadiran(
        updatedIdAbsenFrom,
        updatedIdAbsenTo,
        tanggalDari,
        tanggalSampai,
        pidcabang,
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
      const data = await this.getRekapKehadiran(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.rekapKehadiranService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_rekapkehadiran.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rekapKehadiranService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRekapKehadiranDto: UpdateRekapKehadiranDto,
  ) {
    return this.rekapKehadiranService.update(+id, updateRekapKehadiranDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rekapKehadiranService.remove(+id);
  }
}
