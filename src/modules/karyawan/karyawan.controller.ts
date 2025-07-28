import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  UsePipes,
  Query,
  Put,
  NotFoundException,
  Res,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { KaryawanService } from './karyawan.service';
import {
  CreateKaryawanDto,
  CreateKaryawanSchema,
} from './dto/create-karyawan.dto';
import { UpdateKaryawanDto } from './dto/update-karyawan.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import e, { Express, Response } from 'express';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import path from 'path';
import sharp, { FormatEnum } from 'sharp';
import * as fs from 'fs';
import { UtilsService } from 'src/utils/utils.service';
import { error } from 'console';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

const MAX_FILE_SIZE = 5000000;
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
@Controller('karyawan')
export class KaryawanController {
  constructor(
    private readonly karyawanService: KaryawanService,
    private readonly utilsService: UtilsService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('foto', uploadOptions))
  @Post()
  //@KARYAWAN
  async create(
    @Body() data: CreateKaryawanDto,
    @UploadedFile() foto: Express.Multer.File,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    const user = await dbMssql('users')
      .where({ username: data.namaalias })
      .first();
    const today = new Date(); // e.g. 2025-05-19T09:30:57.806Z

    if (user) {
      throw new BadRequestException('Nama Alias sudah digunakan'); // Throwing an exception ensures proper status code
    }
    if (data?.tglmasukkerja) {
      const parseDMY = (str: string): Date => {
        const parts = str.split('-').map(Number);
        if (parts.length !== 3)
          throw new BadRequestException(
            `Format tanggal harus DD-MM-YYYY, dapat: ${str}`,
          );
        const [day, month, year] = parts;
        const dt = new Date(year, month - 1, day);
        if (isNaN(dt.getTime()))
          throw new BadRequestException(`Tanggal tidak valid: ${str}`);
        return dt;
      };

      const tglMasuk = parseDMY(String(data.tglmasukkerja));
      if (tglMasuk > today) {
        throw new BadRequestException(
          'Tanggal masuk kerja tidak boleh lebih dari hari ini',
        );
      }
    }

    // --- VALIDASI USIA MINIMAL 18 TAHUN ---
    const tglLahir = data.tgllahir ? new Date(data.tgllahir) : null;
    if (tglLahir) {
      const age =
        today.getFullYear() -
        tglLahir.getFullYear() -
        (today.getMonth() < tglLahir.getMonth() ||
        (today.getMonth() === tglLahir.getMonth() &&
          today.getDate() < tglLahir.getDate())
          ? 1
          : 0);

      if (age < 17) {
        throw new BadRequestException('Umur karyawan harus minimal 17 tahun');
      }
    }

    try {
      data.modifiedby = req.user?.user?.username || 'unknown';

      if (foto) {
        const fileName = await this.utilsService.compressImageKaryawan(foto);
        data.foto = fileName;
      }
      const result = await this.karyawanService.create(data, trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error:', error);
      throw new Error(`Error creating parameter: ${error.message}`);
    }
  }
  @Post('rekap-histories')
  //@REKAP-CUTI-KARYAWAN
  async rekapCuti(
    @Body()
    body: {
      id: string[];
      tahun: string;
      isproses: string;
      iskartucuti: string;
    },
  ) {
    const { id, tahun, isproses, iskartucuti } = body;
    // Validasi parameter
    // if (!id || !tahun || !isproses || !iskartucuti) {
    //   throw new BadRequestException(
    //     'Parameter query tahun, isproses, dan iskartucuti wajib diisi',
    //   );
    // }

    // Mulai transaksi
    const trx = await dbMssql.transaction();

    try {
      // Memanggil service dengan parameter tanggal dari dan tanggal sampai yang sudah diformat
      const result = await this.karyawanService.rekapCutiAllKaryawan(
        id, // Pass an empty array or the appropriate array of IDs as the first argument
        tahun,
        isproses,
        iskartucuti,
        trx, // Menggunakan transaksi dalam service
      );
      const result2 = await trx(result);
      // Commit transaksi jika tidak ada error
      await trx.commit();

      return result2;
    } catch (error) {
      // Rollback transaksi jika ada error
      console.log(error);
      await trx.rollback();
      throw new InternalServerErrorException(
        'Terjadi kesalahan saat memproses data',
      );
    }
  }
  @Post('/export-history-cuti')
  @UseGuards(AuthGuard)
  // @KARYAWAN
  async exportToExcelHistoryCuti(
    @Req() req,
    @Body() body,
    @Res() res: Response,
  ) {
    try {
      const data = await this.rekapCuti(body);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath =
        await this.karyawanService.exportToExcelHistoryCuti(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_histori_cuti_karyawan.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Get('all')
  //@KARYAWAN
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Req() req, @Query() query: FindAllDto) {
    const {
      search,
      page,
      limit,
      sortBy,
      sortDirection,
      isLookUp,
      ...filters
    }: { [key: string]: any } = query;
    const sortParams = {
      sortBy: sortBy || 'namakaryawan',
      sortDirection: sortDirection || 'asc',
    };

    const pagination = {
      page: page || 1,
      limit: limit === 0 || !limit ? undefined : limit,
    };

    const params: FindAllParams = {
      search,
      filters,
      pagination,
      isLookUp: isLookUp === 'true',
      sort: sortParams as { sortBy: string; sortDirection: 'asc' | 'desc' },
    };

    return this.karyawanService.findAll(params);
  }
  @Get()
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAllCabang(@Req() req, @Query() query: FindAllDto) {
    const {
      search,
      page,
      limit,
      sortBy,
      sortDirection,
      isLookUp,
      ...filters
    }: { [key: string]: any } = query;

    const role_id = req.user.user.role_id;
    if (!role_id?.includes('1')) {
      const userCabang = req.user.cabang_id;
      // kalau user di cabang 29, izinkan juga lihat cabang 30
      filters.cabang_id = userCabang === 29 ? [29, 1135] : userCabang;
    }

    // ... rest tetap sama ...
    const params: FindAllParams = {
      search,
      filters,
      pagination: { page: page || 1, limit },
      isLookUp: isLookUp === 'true',
      sort: {
        sortBy: sortBy || 'namakaryawan',
        sortDirection: sortDirection || 'asc',
      },
    };

    return this.karyawanService.findAllCabang(params);
  }

  @Get('/export')
  @UseGuards(AuthGuard)
  // @KARYAWAN
  async exportToExcel(@Req() req, @Query() params: any, @Res() res: Response) {
    try {
      // Menambahkan parameter limit dengan nilai default 0
      const limit = params.limit ? parseInt(params.limit, 10) : 0;

      // Menambahkan limit ke dalam params
      params.limit = limit;

      const { data } = await this.findAllCabang(req, params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.karyawanService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_karyawan.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @UseGuards(AuthGuard)
  @Put('/profile/:id')
  //@KARYAWAN
  async updateProfile(
    @Param('id') id: string,
    @Body() updateKaryawanDto: any,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      // Check if the record exists
      const existingData = await trx('karyawan').where('id', id).first();

      if (!existingData) {
        throw new Error('Karyawan not found');
      }

      updateKaryawanDto.modifiedby = req.user?.user?.username || 'unknown';

      // Update the karyawan record
      const result = await this.karyawanService.updateProfileKaryawan(
        +id,
        updateKaryawanDto,
        trx,
      );

      // Commit the transaction
      await trx.commit();
      return result;
    } catch (error) {
      // Rollback in case of an error
      await trx.rollback();
      throw new Error(`Error updating Karyawan: ${error.message}`);
    }
  }

  @UseGuards(AuthGuard)
  @Post('check-delete')
  async checkDelete(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // 1. Cek cuti
      const cutidata = await trx('cuti').where('karyawan_id', data.id).first();
      if (cutidata) {
        await trx.rollback();
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'TIDAK BISA DIHAPUS,KARYAWAN INI SUDAH PERNAH MENGAJUKAN CUTI',
        };
      }

      // 2. Cek izin (pastikan pakai tabel izin, bukan cuti)
      const izindata = await trx('izin').where('karyawan_id', data.id).first();
      if (izindata) {
        await trx.rollback();
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'TIDAK BISA DIHAPUS,KARYAWAN INI SUDAH PERNAH MENGAJUKAN IZIN',
        };
      }

      // 3. Cek saldo cuti
      const saldodata = await trx('saldocuti')
        .where('karyawan_id', data.id)
        .first();
      if (saldodata) {
        await trx.rollback();
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'TIDAK BISA DIHAPUS,KARYAWAN INI SUDAH MEMILIKI SALDO CUTI',
        };
      }

      // — Semua clear, commit transaksi dan kembalikan sukses
      await trx.commit();
      return {
        statusCode: HttpStatus.OK,
        message: 'Boleh di‑delete',
      };
    } catch (error) {
      await trx.rollback();
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
    }
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('foto', uploadOptions))
  @Put(':id')
  //@KARYAWAN
  async update(
    @Param('id') id: string,
    @Body() updateKaryawanDto: any,
    @UploadedFile() foto: Express.Multer.File, // File is optional
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    const user = await trx('users')
      .where({ username: updateKaryawanDto.namaalias })
      .andWhereNot({ karyawan_id: id }) // kecualikan record dengan id ini
      .first();

    const today = new Date(); // e.g. 2025-05-19T09:30:57.806Z

    if (user) {
      throw new BadRequestException('Nama Alias sudah digunakan'); // Throwing an exception ensures proper status code
    }
    if (updateKaryawanDto?.tglmasukkerja) {
      const parseDMY = (str: string): Date => {
        const parts = str.split('-').map(Number);
        if (parts.length !== 3)
          throw new BadRequestException(
            `Format tanggal harus DD-MM-YYYY, dapat: ${str}`,
          );
        const [day, month, year] = parts;
        const dt = new Date(year, month - 1, day);
        if (isNaN(dt.getTime()))
          throw new BadRequestException(`Tanggal tidak valid: ${str}`);
        return dt;
      };

      const tglMasuk = parseDMY(String(updateKaryawanDto.tglmasukkerja));
      if (tglMasuk > today) {
        throw new BadRequestException(
          'Tanggal masuk kerja tidak boleh lebih dari hari ini',
        );
      }
    }

    // --- VALIDASI USIA MINIMAL 18 TAHUN ---
    const tglLahir = updateKaryawanDto.tgllahir
      ? new Date(updateKaryawanDto.tgllahir)
      : null;
    if (tglLahir) {
      const age =
        today.getFullYear() -
        tglLahir.getFullYear() -
        (today.getMonth() < tglLahir.getMonth() ||
        (today.getMonth() === tglLahir.getMonth() &&
          today.getDate() < tglLahir.getDate())
          ? 1
          : 0);

      if (age < 17) {
        throw new BadRequestException('Umur karyawan harus minimal 17 tahun');
      }
    }
    try {
      // Check if the record exists
      const existingData = await trx('karyawan').where('id', id).first();

      if (!existingData) {
        throw new Error('Karyawan not found');
      }
      if (
        existingData.tglresign === null &&
        updateKaryawanDto.tglresign !== null &&
        updateKaryawanDto.tglresign !== undefined &&
        updateKaryawanDto.tglresign !== ''
      ) {
        const timeoutDuration = 10000; // Timeout dalam milidetik
        updateKaryawanDto.statusaktif = 132;
        const kodeCabang = req.user.cabang_id;
        const cabangCodes: string[] = [];

        if (kodeCabang == 26) {
          cabangCodes.push(
            '26 RESIGN',
            '27 RESIGN',
            '28 RESIGN',
            '29 RESIGN',
            '30 RESIGN',
            '31 RESIGN',
            '1135 RESIGN',
            '1136 RESIGN',
          );
        } else {
          cabangCodes.push(`${kodeCabang} RESIGN`); // Menambahkan " RESIGN" di belakang kodeCabang
        }

        // Kirim request ke RabbitMQ untuk setiap cabang
        const requestPromises = cabangCodes.map((cabangCode) =>
          Promise.race([
            this.rabbitmqService.client
              .send({ cmd: `${cabangCode}` }, { id, kodeCabang: cabangCode })
              .toPromise(),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Timeout: Tidak ada response dari cabang ${cabangCode}`,
                    ),
                  ),
                timeoutDuration,
              ),
            ),
          ]),
        );

        // Tunggu sampai semua request selesai
        const responses = await Promise.all(requestPromises);

        // Jika ada response yang gagal, lemparkan error dan rollback transaksi
        for (const response of responses) {
          if (!response || response.status !== 'success') {
            const errorMessage =
              response?.message ||
              'Gagal menonaktifkan akun di salah satu cabang';
            throw new Error(errorMessage);
          }
        }
      } else if (
        existingData.tglresign !== null &&
        updateKaryawanDto.tglresign === ''
      ) {
        const timeoutDuration = 10000; // Timeout dalam milidetik
        const kodeCabang = req.user.cabang_id;
        const cabangCodes: string[] = [];
        updateKaryawanDto.statusaktif = 131;

        if (kodeCabang == 26) {
          cabangCodes.push('26', '27', '28', '29', '30', '31', '1135', '1136');
        } else {
          cabangCodes.push(`${kodeCabang}`); // Menambahkan " RESIGN" di belakang kodeCabang
        }
        // Kirim request ke RabbitMQ untuk setiap cabang
        const requestPromises = cabangCodes.map((cabangCode) =>
          Promise.race([
            this.rabbitmqService.client
              .send({ cmd: `${cabangCode}` }, { id, kodeCabang: cabangCode })
              .toPromise(),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Timeout: Tidak ada response dari cabang ${cabangCode}`,
                    ),
                  ),
                timeoutDuration,
              ),
            ),
          ]),
        );

        // Tunggu sampai semua request selesai
        const responses = await Promise.all(requestPromises);

        // Jika ada response yang gagal, lemparkan error dan rollback transaksi
        for (const response of responses) {
          if (!response || response.status !== 'success') {
            const errorMessage =
              response?.message ||
              'Gagal menonaktifkan akun di salah satu cabang';
            throw new Error(errorMessage);
          }
        }
      }
      updateKaryawanDto.modifiedby = req.user?.user?.username || 'unknown';

      // If a new photo is uploaded, delete the old one
      if (foto) {
        // Delete the old image file if it exists
        if (existingData.foto) {
          const oldFilePath = path.join(
            process.cwd(),
            'uploads/compress',
            existingData.foto,
          );
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath); // Remove old file
          }
        }

        // Compress and save the new image
        const fileName = await this.utilsService.compressImageKaryawan(foto); // Compress the new image
        updateKaryawanDto.foto = fileName; // Assign the new file name
      } else {
        updateKaryawanDto.foto = existingData.foto; // If no new file, keep the old file name
      }

      // Update the karyawan record
      const result = await this.karyawanService.update(
        +id,
        updateKaryawanDto,
        trx,
      );

      // Commit the transaction
      await trx.commit();
      return result;
    } catch (error) {
      // Rollback in case of an error

      await trx.rollback();
      throw new Error(`Error updating Karyawan: ${error}`);
    }
  }

  @Delete(':id')
  //@KARYAWAN
  async remove(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      // Find the existing record to get the file name
      const existingData = await trx('karyawan').where('id', id).first();

      // Delete the file if it exists
      if (existingData.foto) {
        const filePath = path.join(
          process.cwd(),
          'uploads/compress',
          existingData.foto,
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath); // Remove the file from disk
        }
      }

      // Delete the record from the database
      const result = await this.karyawanService.delete(+id, trx);

      if (result.status === 404) {
        throw new NotFoundException(result.message);
      }

      // Commit the transaction
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback in case of an error
      await trx.rollback();
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Failed to update parameter',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/export-byselect')
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.karyawanService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.karyawanService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_karyawan.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.karyawanService.findAllByIds(ids);
  }

  @UseGuards(AuthGuard)
  @Get('/cutikaryawan/:id')
  async findProfileById(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const karyawan = await this.karyawanService.findProfileKaryawan(+id, trx);

      // Pastikan transaksi berhasil
      await trx.commit();
      return karyawan;
    } catch (error) {
      // Pastikan transaksi rollback jika terjadi error
      await trx.rollback();
      console.error(error); // Logging error untuk debugging
      throw error; // Melempar kembali error
    }
  }
  @Get('rekap-saldo-cuti')
  //@REKAP-SALDO-CUTI
  async rekapSaldoCuti(
    @Body()
    body: {
      idkaryawan: string[];
      tahun: string;
      isproses: string;
      iskartucuti: string;
    },
  ) {
    const { idkaryawan, tahun, isproses, iskartucuti } = body;

    // Mulai transaksi
    const trx = await dbMssql.transaction();

    try {
      // Memanggil service dengan parameter tanggal dari dan tanggal sampai yang sudah diformat
      const result = await this.karyawanService.rekapCutiAllKaryawan(
        idkaryawan,
        tahun,
        isproses,
        iskartucuti,
        trx, // Menggunakan transaksi dalam service
      );

      // Commit transaksi jika tidak ada error
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback transaksi jika ada error
      console.log('error', error);
      await trx.rollback();
      throw new InternalServerErrorException(
        'Terjadi kesalahan saat memproses data',
      );
    }
  }
  @UseGuards(AuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const karyawan = await this.karyawanService.findById(+id, trx);
      if (!karyawan) {
        throw new NotFoundException('Karyawan not found');
      }

      // Pastikan transaksi berhasil
      await trx.commit();
      return karyawan;
    } catch (error) {
      // Pastikan transaksi rollback jika terjadi error
      await trx.rollback();
      console.error(error); // Logging error untuk debugging
      throw error; // Melempar kembali error
    }
  }
}
