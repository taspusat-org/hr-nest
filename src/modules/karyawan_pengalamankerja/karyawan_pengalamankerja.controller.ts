import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  NotFoundException,
  Put,
  UseGuards,
  Req,
} from '@nestjs/common';
import { KaryawanPengalamankerjaService } from './karyawan_pengalamankerja.service';
import { CreateKaryawanPengalamankerjaDto } from './dto/create-karyawan_pengalamankerja.dto';
import { UpdateKaryawanPengalamankerjaDto } from './dto/update-karyawan_pengalamankerja.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';

@Controller('karyawan-pengalamankerja')
export class KaryawanPengalamankerjaController {
  constructor(
    private readonly karyawanPengalamankerjaService: KaryawanPengalamankerjaService,
  ) {}

  @Put(':id')
  @UseGuards(AuthGuard)
  async createKaryawanNomorDarurat(
    @Param('id') id: number,
    @Req() req,
    @Body() data: any, // This will hold the validated request body
  ) {
    const trx = await dbMssql.transaction();
    try {
      // Get the modifiedby value from the request user
      const modifiedby = req.user?.user?.username || 'unknown';
      // Call the create method and pass modifiedby as a parameter
      const result = await this.karyawanPengalamankerjaService.create(
        data,
        modifiedby,
        id,
        trx,
      );

      await trx.commit();

      return { data: result };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  @Get(':karyawan_id')
  async findAll(@Param('karyawan_id') karyawan_id: number) {
    const data = await this.karyawanPengalamankerjaService.findAll(karyawan_id);

    // If no data found, throw a NotFoundException
    if (Array.isArray(data) && data.length === 0) {
      throw new NotFoundException(
        'No work experience data found for this employee',
      );
    }

    return data;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanPengalamankerjaService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateKaryawanPengalamankerjaDto: UpdateKaryawanPengalamankerjaDto,
  ) {
    return this.karyawanPengalamankerjaService.update(
      +id,
      updateKaryawanPengalamankerjaDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanPengalamankerjaService.remove(+id);
  }
}
