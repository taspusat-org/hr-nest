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
  UploadedFile,
  Query,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { KaryawanVaksinService } from './karyawan_vaksin.service';
import { CreateKaryawanVaksinDto } from './dto/create-karyawan_vaksin.dto';
import { UpdateKaryawanVaksinDto } from './dto/update-karyawan_vaksin.dto';
import { AuthGuard } from '../auth/auth.guard';
import multer, { diskStorage } from 'multer';
import { dbMssql } from 'src/common/utils/db';
import { UtilsService } from 'src/utils/utils.service';
import { LogtrailService } from 'src/common/logtrail/logtrail.service';
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
@Controller('karyawan-vaksin')
export class KaryawanVaksinController {
  constructor(
    private readonly karyawanVaksinService: KaryawanVaksinService,
    private readonly utilsService: UtilsService,
    private readonly logTrailService: LogtrailService,
  ) {}

  @UseGuards(AuthGuard)
  @UseInterceptors(AnyFilesInterceptor(uploadOptions)) // Interceptor untuk file upload
  @Put(':id')
  async create(
    @Param('id') id: number,
    @Body() body: any, // Data non-file
    @UploadedFiles() filefoto: Array<Express.Multer.File>, // Files yang diupload
    @Req() req,
  ) {
    const trx = await dbMssql.transaction(); // Mulai transaksi
    try {
      const data = body?.data;
      // Panggil service untuk menangani insert dan update
      const result = await this.karyawanVaksinService.createOrUpdate(
        data,
        filefoto,
        req,
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
  async findAll(
    @Param('karyawan_id') karyawan_id: number,
    @Query('sortBy') sortBy: string = 'tglvaksin', // Default sort by 'created_at'
    @Query('sortDirection') sortDirection: string = 'desc', // Default sort direction 'desc'
  ) {
    const data = await this.karyawanVaksinService.findAll(
      karyawan_id,
      sortBy,
      sortDirection,
    );

    // If no data found, throw a NotFoundException
    if (Array.isArray(data) && data.length === 0) {
      throw new NotFoundException(
        'No vaccination data found for this employee',
      );
    }

    return data;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanVaksinService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateKaryawanVaksinDto: UpdateKaryawanVaksinDto,
  ) {
    return this.karyawanVaksinService.update(+id, updateKaryawanVaksinDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanVaksinService.remove(+id);
  }
}
