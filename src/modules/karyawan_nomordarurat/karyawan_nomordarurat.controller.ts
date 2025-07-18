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
  Req,
  UseGuards,
} from '@nestjs/common';
import { KaryawanNomordaruratService } from './karyawan_nomordarurat.service';
import { CreateKaryawanNomordaruratDto } from './dto/create-karyawan_nomordarurat.dto';
import { UpdateKaryawanNomordaruratDto } from './dto/update-karyawan_nomordarurat.dto';
import { dbMssql } from 'src/common/utils/db';
import { AuthGuard } from '../auth/auth.guard';

@Controller('karyawan-nomordarurat')
export class KaryawanNomordaruratController {
  constructor(
    private readonly karyawanNomordaruratService: KaryawanNomordaruratService,
  ) {}

  @Put(':id')
  @UseGuards(AuthGuard)
  async createKaryawanNomorDarurat(
    @Param('id') id: number,
    @Req() req,
    @Body() karyawanNomordaruratDto: any, // This will hold the validated request body
  ) {
    const trx = await dbMssql.transaction();
    try {
      // Get the modifiedby value from the request user
      const modifiedby = req.user?.user?.username || 'unknown';
      // Call the create method and pass modifiedby as a parameter
      const result = await this.karyawanNomordaruratService.create(
        karyawanNomordaruratDto,
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
    const data = await this.karyawanNomordaruratService.findAll(karyawan_id);

    // Check if data is empty or not found
    if (isNaN(karyawan_id)) {
      return { status: false, message: 'Invalid user ID format', data: [] }; // Return a proper message when the ID format is invalid
    }
    return data;
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanNomordaruratService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateKaryawanNomordaruratDto: UpdateKaryawanNomordaruratDto,
  ) {
    return this.karyawanNomordaruratService.update(
      +id,
      updateKaryawanNomordaruratDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanNomordaruratService.remove(+id);
  }
}
