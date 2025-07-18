import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LaporanIzinKaryawanService } from './laporan_izin_karyawan.service';
import { CreateLaporanIzinKaryawanDto } from './dto/create-laporan_izin_karyawan.dto';
import { UpdateLaporanIzinKaryawanDto } from './dto/update-laporan_izin_karyawan.dto';

@Controller('laporan-izin-karyawan')
export class LaporanIzinKaryawanController {
  constructor(
    private readonly laporanIzinKaryawanService: LaporanIzinKaryawanService,
  ) {}

  @Post()
  //@LAPORANIZIN-KARYAWAN
  create(@Body() createLaporanIzinKaryawanDto: CreateLaporanIzinKaryawanDto) {
    return this.laporanIzinKaryawanService.create(createLaporanIzinKaryawanDto);
  }

  @Get()
  //@LAPORANIZIN-KARYAWAN
  findAll() {
    return this.laporanIzinKaryawanService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.laporanIzinKaryawanService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLaporanIzinKaryawanDto: UpdateLaporanIzinKaryawanDto,
  ) {
    return this.laporanIzinKaryawanService.update(
      +id,
      updateLaporanIzinKaryawanDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.laporanIzinKaryawanService.remove(+id);
  }
}
