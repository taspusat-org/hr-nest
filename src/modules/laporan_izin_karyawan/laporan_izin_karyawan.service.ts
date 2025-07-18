import { Injectable } from '@nestjs/common';
import { CreateLaporanIzinKaryawanDto } from './dto/create-laporan_izin_karyawan.dto';
import { UpdateLaporanIzinKaryawanDto } from './dto/update-laporan_izin_karyawan.dto';

@Injectable()
export class LaporanIzinKaryawanService {
  create(createLaporanIzinKaryawanDto: CreateLaporanIzinKaryawanDto) {
    return 'This action adds a new laporanIzinKaryawan';
  }

  findAll() {
    return `This action returns all laporanIzinKaryawan`;
  }

  findOne(id: number) {
    return `This action returns a #${id} laporanIzinKaryawan`;
  }

  update(
    id: number,
    updateLaporanIzinKaryawanDto: UpdateLaporanIzinKaryawanDto,
  ) {
    return `This action updates a #${id} laporanIzinKaryawan`;
  }

  remove(id: number) {
    return `This action removes a #${id} laporanIzinKaryawan`;
  }
}
