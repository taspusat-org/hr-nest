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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { KaryawanBerkasService } from './karyawan_berkas.service';
import { CreateKaryawanBerkaDto } from './dto/create-karyawan_berka.dto';
import { UpdateKaryawanBerkaDto } from './dto/update-karyawan_berka.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
const MAX_FILE_SIZE = 5000000; // Max file size 5MB
const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const storage = multer.memoryStorage();
const uploadOptions: multer.Options = {
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(
        new Error('Only .jpg, .jpeg, .png, and .webp formats are supported.'),
      );
    }
    cb(null, true);
  },
};
@Controller('karyawan-berkas')
export class KaryawanBerkasController {
  constructor(private readonly karyawanBerkasService: KaryawanBerkasService) {}

  @UseGuards(AuthGuard)
  @UseInterceptors(AnyFilesInterceptor(uploadOptions)) // Interceptor untuk file upload
  @Put(':id')
  async create(
    @Param('id') id: number,
    @Body() body: any, // Data non-file
    @UploadedFiles() fileberkas: Array<Express.Multer.File>, // Files yang diupload
    @Req() req,
  ) {
    const trx = await dbMssql.transaction(); // Mulai transaksi
    // Periksa apakah filefoto sudah diterima
    try {
      const data = body?.data;
      // Panggil service untuk menangani insert dan update
      const result = await this.karyawanBerkasService.createOrUpdate(
        data,
        fileberkas,
        req.user,
        id,
        trx,
      );

      await trx.commit(); // Commit transaksi
      return result;
    } catch (error) {
      await trx.rollback(); // Rollback transaksi jika terjadi error
      console.error('Error:', error);
      throw new Error(`Error creating karyawan vaksin: ${error.message}`);
    }
  }

  @Get(':karyawan_id')
  async findAll(@Param('karyawan_id') karyawan_id: number) {
    const data = await this.karyawanBerkasService.findAll(karyawan_id);

    // If no data found, throw a NotFoundException
    if (Array.isArray(data) && data.length === 0) {
      throw new NotFoundException('No document data found for this employee');
    }

    return data;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanBerkasService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateKaryawanBerkaDto: UpdateKaryawanBerkaDto,
  ) {
    return this.karyawanBerkasService.update(+id, updateKaryawanBerkaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanBerkasService.remove(+id);
  }
}
