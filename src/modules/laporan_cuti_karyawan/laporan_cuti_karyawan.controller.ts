import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LaporanCutiKaryawanService } from './laporan_cuti_karyawan.service';
import { CreateLaporanCutiKaryawanDto } from './dto/create-laporan_cuti_karyawan.dto';
import { UpdateLaporanCutiKaryawanDto } from './dto/update-laporan_cuti_karyawan.dto';

@Controller('laporan-cuti-karyawan')
export class LaporanCutiKaryawanController {
  constructor(
    private readonly laporanCutiKaryawanService: LaporanCutiKaryawanService,
  ) {}

  @Post()
  //@LAPORANCUTI-KARYAWAN
  create(@Body() createLaporanCutiKaryawanDto: CreateLaporanCutiKaryawanDto) {
    return this.laporanCutiKaryawanService.create(createLaporanCutiKaryawanDto);
  }

  @Get()
  //@LAPORANCUTI-KARYAWAN
  findAll() {
    return this.laporanCutiKaryawanService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.laporanCutiKaryawanService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLaporanCutiKaryawanDto: UpdateLaporanCutiKaryawanDto,
  ) {
    return this.laporanCutiKaryawanService.update(
      +id,
      updateLaporanCutiKaryawanDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.laporanCutiKaryawanService.remove(+id);
  }
}
