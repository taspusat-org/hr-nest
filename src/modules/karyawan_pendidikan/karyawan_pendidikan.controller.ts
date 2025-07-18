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
import { KaryawanPendidikanService } from './karyawan_pendidikan.service';
import { CreateKaryawanPendidikanDto } from './dto/create-karyawan_pendidikan.dto';
import { UpdateKaryawanPendidikanDto } from './dto/update-karyawan_pendidikan.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';

@Controller('karyawan-pendidikan')
export class KaryawanPendidikanController {
  constructor(
    private readonly karyawanPendidikanService: KaryawanPendidikanService,
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
      const result = await this.karyawanPendidikanService.create(
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
    const data = await this.karyawanPendidikanService.findAll(karyawan_id);

    // If no data found, throw a NotFoundException
    if (Array.isArray(data) && data.length === 0) {
      throw new NotFoundException(
        'No educational data found for this employee',
      );
    }

    return data;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanPendidikanService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateKaryawanPendidikanDto: UpdateKaryawanPendidikanDto,
  ) {
    return this.karyawanPendidikanService.update(
      +id,
      updateKaryawanPendidikanDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanPendidikanService.remove(+id);
  }
}
