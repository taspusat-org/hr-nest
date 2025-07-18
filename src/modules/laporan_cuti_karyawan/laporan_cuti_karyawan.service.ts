import { Injectable } from '@nestjs/common';
import { CreateLaporanCutiKaryawanDto } from './dto/create-laporan_cuti_karyawan.dto';
import { UpdateLaporanCutiKaryawanDto } from './dto/update-laporan_cuti_karyawan.dto';

@Injectable()
export class LaporanCutiKaryawanService {
  create(createLaporanCutiKaryawanDto: CreateLaporanCutiKaryawanDto) {
    return 'This action adds a new laporanCutiKaryawan';
  }

  findAll() {
    return `This action returns all laporanCutiKaryawan`;
  }

  findOne(id: number) {
    return `This action returns a #${id} laporanCutiKaryawan`;
  }

  update(
    id: number,
    updateLaporanCutiKaryawanDto: UpdateLaporanCutiKaryawanDto,
  ) {
    return `This action updates a #${id} laporanCutiKaryawan`;
  }

  remove(id: number) {
    return `This action removes a #${id} laporanCutiKaryawan`;
  }
}
