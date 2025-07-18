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
import { RekapitulasikehadiranService } from './rekapitulasikehadiran.service';
import { CreateRekapitulasikehadiranDto } from './dto/create-rekapitulasikehadiran.dto';
import { UpdateRekapitulasikehadiranDto } from './dto/update-rekapitulasikehadiran.dto';
import { dbMssql } from 'src/common/utils/db';
import { Response } from 'express';
import * as fs from 'fs';
@Controller('rekapitulasikehadiran')
export class RekapitulasikehadiranController {
  constructor(
    private readonly rekapitulasikehadiranService: RekapitulasikehadiranService,
  ) {}
  @Get()
  async getRekapitulasiKehadiran(
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
      sortBy = 'namakaryawan', // Default to 'namakaryawan' if no sorting column is provided
      sortDirection = 'asc', // Default to 'asc' if no sorting direction is provided
    } = query;

    // Cek apakah idabsenFrom atau idabsenTo adalah null, jika iya set menjadi string kosong
    const updatedIdAbsenFrom = idabsenFrom === 'null' ? '' : idabsenFrom;
    const updatedIdAbsenTo = idabsenTo === 'null' ? '' : idabsenTo;

    console.log(
      updatedIdAbsenFrom,
      updatedIdAbsenTo,
      typeof updatedIdAbsenFrom,
      typeof updatedIdAbsenTo,
    );
    // Start the transaction
    const trx = await dbMssql.transaction();

    try {
      // Call the service method to process the data
      const result =
        await this.rekapitulasikehadiranService.rekapitulasiKehadiran(
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
      const data = await this.getRekapitulasiKehadiran(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath =
        await this.rekapitulasikehadiranService.exportToExcel(data);

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
  create(
    @Body() createRekapitulasikehadiranDto: CreateRekapitulasikehadiranDto,
  ) {
    return this.rekapitulasikehadiranService.create(
      createRekapitulasikehadiranDto,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rekapitulasikehadiranService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRekapitulasikehadiranDto: UpdateRekapitulasikehadiranDto,
  ) {
    return this.rekapitulasikehadiranService.update(
      +id,
      updateRekapitulasikehadiranDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rekapitulasikehadiranService.remove(+id);
  }
}
