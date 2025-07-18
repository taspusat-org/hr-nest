import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  ParseIntPipe,
  UsePipes,
  UploadedFile,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
  HttpStatus,
  HttpException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { dbMssql } from 'src/common/utils/db';
import { CutiService } from './cuti.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { AuthGuard } from '../auth/auth.guard';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { UtilsService } from 'src/utils/utils.service';
import * as fs from 'fs';
import { Response } from 'express';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';
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
@Controller('cuti')
//@CUTI
export class CutiController {
  constructor(
    private readonly cutiService: CutiService,
    private readonly utilsService: UtilsService,
  ) {}

  @Get('rekap')
  //@REKAP-CUTI-KARYAWAN
  async rekapCuti(
    @Query()
    query: {
      idcabang: number;
      tanggalDari: string;
      tanggalSampai: string;
    },
  ) {
    const { idcabang, tanggalDari, tanggalSampai } = query;

    // Validasi parameter
    if (!idcabang || !tanggalDari || !tanggalSampai) {
      throw new BadRequestException(
        'Parameter query idcabang, tanggalDari, dan tanggalSampai wajib diisi',
      );
    }

    // Konversi tanggal dari dd-mm-yyyy menjadi yyyy-mm-dd
    const formattedTanggalDari = this.convertDateFormat(tanggalDari);
    const formattedTanggalSampai = this.convertDateFormat(tanggalSampai);

    // Mulai transaksi
    const trx = await dbMssql.transaction();

    try {
      // Memanggil service dengan parameter tanggal dari dan tanggal sampai yang sudah diformat
      const result = await this.cutiService.rekapCutiData(
        Number(idcabang),
        formattedTanggalDari,
        formattedTanggalSampai,
        trx, // Menggunakan transaksi dalam service
      );

      // Commit transaksi jika tidak ada error
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback transaksi jika ada error
      await trx.rollback();
      throw new InternalServerErrorException(
        'Terjadi kesalahan saat memproses data',
      );
    }
  }
  @Get('/export-rekap')
  @UseGuards(AuthGuard)
  async exportRekapCuti(@Req() req, @Res() res: Response) {
    try {
      // Mengambil parameter query yang diperlukan
      const { idcabang, tanggalDari, tanggalSampai } = req.query;

      // Validasi parameter query
      if (!idcabang || !tanggalDari || !tanggalSampai) {
        throw new BadRequestException(
          'Parameter query idcabang, tanggalDari, dan tanggalSampai wajib diisi',
        );
      }

      // Konversi tanggal dari dd-mm-yyyy menjadi yyyy-mm-dd
      const formattedTanggalDari = this.convertDateFormat(tanggalDari);
      const formattedTanggalSampai = this.convertDateFormat(tanggalSampai);

      // Mulai transaksi
      const trx = await dbMssql.transaction();

      // Memanggil service untuk mendapatkan data rekap cuti
      const result = await this.cutiService.rekapCutiData(
        Number(idcabang),
        formattedTanggalDari,
        formattedTanggalSampai,
        trx, // Menggunakan transaksi dalam service
      );

      // Commit transaksi jika tidak ada error
      await trx.commit();

      if (!Array.isArray(result)) {
        throw new Error('Data is not an array or is undefined.');
      }

      // Mengekspor data ke Excel
      const tempFilePath = await this.cutiService.exportToExcelRekap(result);

      const fileStream = fs.createReadStream(tempFilePath);

      // Menentukan header response untuk file Excel
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_cuti_karyawan.xlsx"',
      );

      // Mengirimkan file sebagai response
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Get('rekap-saldo-cuti')
  //@REKAP-SALDO-CUTI
  async rekapSaldoCuti(
    @Query()
    query: {
      idcabang: number;
      tahun: string;
    },
  ) {
    const { idcabang, tahun } = query;

    // Validasi parameter
    if (!idcabang || !tahun) {
      throw new BadRequestException(
        'Parameter query idcabang, tahun wajib diisi',
      );
    }

    // Mulai transaksi
    const trx = await dbMssql.transaction();

    try {
      // Memanggil service dengan parameter tanggal dari dan tanggal sampai yang sudah diformat
      const result = await this.cutiService.rekapSaldoCutiData(
        Number(idcabang),
        tahun,
        trx, // Menggunakan transaksi dalam service
      );

      // Commit transaksi jika tidak ada error
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback transaksi jika ada error
      await trx.rollback();
      throw new InternalServerErrorException(
        'Terjadi kesalahan saat memproses data',
      );
    }
  }
  @Get('/export-rekap-saldocuti')
  @UseGuards(AuthGuard)
  async exportRekapSaldoCuti(@Req() req, @Res() res: Response) {
    try {
      // Mengambil parameter query yang diperlukan
      const { idcabang, tahun } = req.query;

      // Validasi parameter query
      if (!idcabang || !tahun) {
        throw new BadRequestException(
          'Parameter query idcabang, tanggalDari, dan tanggalSampai wajib diisi',
        );
      }

      // Mulai transaksi
      const trx = await dbMssql.transaction();

      // Memanggil service untuk mendapatkan data rekap cuti
      const result = await this.cutiService.rekapSaldoCutiData(
        Number(idcabang),
        tahun,
        trx, // Menggunakan transaksi dalam service
      );

      // Commit transaksi jika tidak ada error
      await trx.commit();

      if (!Array.isArray(result)) {
        throw new Error('Data is not an array or is undefined.');
      }

      // Mengekspor data ke Excel
      const tempFilePath = await this.cutiService.exportRekapSaldoCuti(
        result,
        tahun,
      );

      const fileStream = fs.createReadStream(tempFilePath);

      // Menentukan header response untuk file Excel
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_saldo_cuti_karyawan.xlsx"',
      );

      // Mengirimkan file sebagai response
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  // Fungsi untuk mengkonversi tanggal dari dd-mm-yyyy menjadi yyyy-mm-dd
  convertDateFormat(date: string): string {
    const [day, month, year] = date.split('-'); // Split by dash
    return `${year}-${month}-${day}`; // Format ulang menjadi yyyy-mm-dd
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(AnyFilesInterceptor(uploadOptions))
  @Post()
  // @CUTI
  async create(
    @Body() createCutiDto: any, // Data selain file
    @UploadedFiles() lampiran: Array<Express.Multer.File>, // File yang di-upload
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    // Pastikan createCutiDto berisi data yang diharapkan
    const detailCutiArray = JSON.parse(createCutiDto.detailCuti);
    // Ambil semua cuti_id berdasarkan karyawan_id dari tabel cuti
    const cutiList = await trx('cuti')
      .where('statuscuti', '=', 150)
      .andWhere('karyawan_id', createCutiDto.karyawan_id)
      .select('id'); // Ambil semua cuti_id yang terkait dengan karyawan_id tersebut

    if (cutiList.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Masih ada cuti yang belum di-setujui',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const cutiListData = await trx('cuti')
      .where('statuscuti', '=', 151)
      .andWhere('karyawan_id', createCutiDto.karyawan_id)
      .select('id'); // Ambil semua cuti_id yang terkait dengan karyawan_id tersebut
    // Ambil semua tglcuti yang ada pada cuti_id yang sudah ada
    const existingCutiDates = await trx('cutidetail')
      .whereIn(
        'cuti_id',
        cutiListData.map((cuti) => cuti.id),
      )
      .select('tglcuti'); // Ambil tanggal cuti yang sudah ada
    const existingCutiDatesFormatted = existingCutiDates.map(
      (existing) => existing.tglcuti.toISOString().split('T')[0], // Mengambil hanya bagian 'YYYY-MM-DD'
    );

    // Periksa setiap tanggal cuti yang diajukan
    const duplicateDates: string[] = [];
    for (const cuti of detailCutiArray) {
      const { tglcuti } = cuti; // Ambil tanggal cuti yang diajukan

      // Cek apakah tglcuti yang diajukan sudah ada di dalam daftar tglcuti yang sudah ada
      const isCutiExists = existingCutiDatesFormatted.some(
        (existing) => existing === tglcuti,
      );
      if (isCutiExists) {
        // Jika sudah ada, simpan tanggal yang duplikat
        duplicateDates.push(tglcuti);
      }
    }
    if (duplicateDates.length > 0) {
      const formattedDuplicateDates = duplicateDates.map((date) => {
        const dateObj = new Date(date);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // +1 karena bulan dimulai dari 0
        const year = dateObj.getFullYear();
        return `${day}-${month}-${year}`;
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Maaf!, anda sudah pernah mengambil cuti pada tanggal: ${formattedDuplicateDates.join(', ')}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const batasCuti = await trx('parameter')
      .select('*')
      .where({ grp: 'BATASCUTI' });
    const sortedCutiDates = detailCutiArray
      .map((cuti) => cuti.tglcuti)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    for (let i = 1; i < sortedCutiDates.length; i++) {
      const currentDate = new Date(sortedCutiDates[i]);
      const previousDate = new Date(sortedCutiDates[i - 1]);
      const diffTime = Math.abs(currentDate.getTime() - previousDate.getTime());
      const diffDays = diffTime / (1000 * 3600 * 24); // Menghitung selisih hari

      if (diffDays > (Number(batasCuti[0]?.text) || 7)) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Tanggal cuti tidak boleh berjarak lebih dari 3 hari.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    // Proses seperti sebelumnya

    try {
      if (lampiran) {
        const fileNames = await Promise.all(
          lampiran.map((file) => this.utilsService.compressImage(file)),
        );
        createCutiDto.lampiran = JSON.stringify(fileNames); // Mengubah file menjadi string JSON
      }

      const result = await this.cutiService.create(
        createCutiDto,
        trx,
        req.user?.user?.username,
      );

      // Commit transaksi jika sukses
      await trx.commit();
      return result;
    } catch (error) {
      // Rollback transaksi jika error
      await trx.rollback();
      console.error('Error creating cuti:', error);

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
  @Get('overview')
  async overviewCuti(
    @Query('karyawan_id') karyawan_id: number, // Ambil karyawan_id dari query parameter
    @Req() req,
  ) {
    try {
      // Panggil service untuk mengambil overview cuti
      const overviewData = await this.cutiService.getOverviewCuti(karyawan_id);

      // Kembalikan response
      return overviewData;
    } catch (error) {
      console.error('Error fetching overview cuti:', error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || 'Error fetching overview cuti',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(AuthGuard)
  @Post('check-cuti')
  async checkAddCuti(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // Mengecek apakah data cuti dan approval sudah ada
      const existing = await trx('cuti')
        .where('karyawan_id', data.karyawan_id)
        .andWhere('statuscuti', 150)
        .first();

      if (existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message:
            'TIDAK BISA MENGAJUKAN CUTI, MASIH ADA CUTI YANG BELUM DI APPROVE',
        };
      }

      // Menangani kondisi jika status sudah di-setujui, ditolak, atau dibatalkan

      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Cuti dapat diproses',
      }; // Bisa sesuaikan dengan response yang diinginkan
    } catch (error) {
      // Rollback transaksi jika terjadi error
      await trx.rollback();
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
    }
  }

  @UseGuards(AuthGuard)
  @Post('check-approval')
  async checkApproval(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // Mengecek apakah data cuti dan approval sudah ada
      const existing = await trx('cutiapproval')
        .select('statusapproval', 'jenjangapproval')
        .where('cuti_id', data.id)
        .andWhere('karyawan_id', data.karyawan_id)
        .first();

      // Mengecek apakah ada approval dengan status 150 dan jenjangapproval lebih rendah
      const previousApproval = await trx('cutiapproval')
        .where('cuti_id', data.id)
        .andWhere('statusapproval', 150)
        .andWhere('jenjangapproval', '<', existing.jenjangapproval)
        .first();

      if (previousApproval) {
        // Fetch employee name based on karyawan_id
        const employee = await trx('karyawan') // Assuming there's an employees table
          .select('namakaryawan') // Fetching employee's name
          .where('id', previousApproval.karyawan_id) // Use previousApproval.karyawan_id
          .first();

        // If employee exists, include the name in the message
        const message = `Tidak dapat menyetujui cuti, karena belum dikonfirmasi oleh: ${employee.namakaryawan}`;

        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: message,
        };
      }

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-setujui, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 151:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI APPROVE',
          };
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }

      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Cuti dapat diproses',
      }; // Bisa sesuaikan dengan response yang diinginkan
    } catch (error) {
      // Rollback transaksi jika terjadi error
      await trx.rollback();
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
    }
  }

  @UseGuards(AuthGuard)
  @Post('check-reject')
  async checkReject(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // Mengecek apakah data cuti dan approval sudah ada
      const existing = await trx('cutiapproval')
        .select('statusapproval')
        .where('cuti_id', data.id)
        .andWhere('karyawan_id', data.karyawan_id)
        .first();

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-setujui, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 151:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI APPROVE',
          };
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }
      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Cuti dapat diproses',
      }; // Bisa sesuaikan dengan response yang diinginkan
    } catch (error) {
      // Rollback transaksi jika terjadi error
      await trx.rollback();
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
    }
  }
  @UseGuards(AuthGuard)
  @Post('check-cancel')
  async checkCancel(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // Mengecek apakah data cuti dan approval sudah ada
      const existing = await trx('cutiapproval')
        .select('statusapproval')
        .where('cuti_id', data.id)
        // .andWhere('karyawan_id', data.karyawan_id)
        .first();

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-setujui, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }
      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Cuti dapat diproses',
      }; // Bisa sesuaikan dengan response yang diinginkan
    } catch (error) {
      // Rollback transaksi jika terjadi error
      await trx.rollback();
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
    }
  }
  @UseGuards(AuthGuard)
  @Post('check-cancel-karyawan')
  async checkCancelCutiKaryawan(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // Mengecek apakah data cuti dan approval sudah ada
      const existing = await trx('cuti')
        .select('statuscuti')
        .where('id', data.id)
        // .andWhere('karyawan_id', data.karyawan_id)
        .first();

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-setujui, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 151:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message:
              'CUTI SUDAH DI APPROVE, MINTA ATASAN ANDA UNTUK MEMBATALKAN',
          };
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'CUTI SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }
      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Cuti dapat diproses',
      }; // Bisa sesuaikan dengan response yang diinginkan
    } catch (error) {
      // Rollback transaksi jika terjadi error
      await trx.rollback();
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Terjadi kesalahan pada server',
      };
    }
  }
  // Endpoint untuk memperbarui data cuti
  @UseGuards(AuthGuard)
  @UseInterceptors(AnyFilesInterceptor(uploadOptions)) // Interceptor untuk file upload
  @Put(':id')
  async update(
    @Param('id') id: number,
    @Body() updateCutiHeader: any,
    @UploadedFiles() lampiran: Array<Express.Multer.File>, // Files yang diupload
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();

    // Mengecek apakah data approval ada
    const existing = await trx('cutiapproval')
      .select('statusapproval')
      .where('cuti_id', id)
      // .andWhere('karyawan_id', updateCutiHeader.karyawan_id)
      .first();

    if (!existing) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Menangani status approval
    if (existing.statusapproval === 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI APPROVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing.statusapproval === 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI TOLAK',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing.statusapproval === 3) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI BATALKAN',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Helper function untuk ekstrak nama file dari URL atau path
    const extractFileName = (fileStr: any): string => {
      if (typeof fileStr !== 'string') {
        return ''; // Jika bukan string, kembalikan string kosong
      }
      const parts = fileStr.split('/');
      return parts[parts.length - 1];
    };

    try {
      if (lampiran && lampiran.length > 0) {
        // Proses file baru yang diupload
        const newFileNamesRaw = await Promise.all(
          lampiran.map((file) => this.utilsService.compressImage(file)),
        );
        const newFileNames = newFileNamesRaw.map((name: any) =>
          extractFileName(name),
        );

        if (!updateCutiHeader.lampiran) {
          // Jika tidak ada lampiran di updateCutiHeader, langsung set dengan file baru
          updateCutiHeader.lampiran = JSON.stringify(newFileNames);
        } else {
          // Jika ada lampiran di updateCutiHeader, gabungkan dengan file baru
          let existingFiles: string[] = [];

          if (!Array.isArray(updateCutiHeader.lampiran)) {
            existingFiles = [updateCutiHeader.lampiran];
          } else {
            existingFiles = updateCutiHeader.lampiran;
          }

          existingFiles = existingFiles.map((file: any) =>
            extractFileName(file),
          );

          // Gabungkan file lama dan file baru tanpa duplikasi
          existingFiles = [...new Set([...existingFiles, ...newFileNames])];

          updateCutiHeader.lampiran = JSON.stringify(existingFiles);
        }
      } else if (updateCutiHeader.lampiran) {
        // Jika tidak ada file baru di lampiran, tapi ada lampiran di updateCutiHeader
        let existingFiles: string[] = [];

        try {
          existingFiles = JSON.parse(updateCutiHeader.lampiran);
          if (!Array.isArray(existingFiles)) {
            existingFiles = [existingFiles];
          }
        } catch (error) {
          existingFiles = [updateCutiHeader.lampiran];
        }

        // Pastikan semua file yang ada valid
        existingFiles = existingFiles.map((file: any) =>
          typeof file === 'string' ? extractFileName(file) : '',
        );
        updateCutiHeader.lampiran = JSON.stringify(existingFiles);
      } else {
        // Jika tidak ada lampiran baru dan tidak ada updateCutiHeader.lampiran
        updateCutiHeader.lampiran = null;
      }

      // Proses pembaruan data cuti
      const result = await this.cutiService.update(
        updateCutiHeader,
        id,
        trx,
        req.user?.user?.username,
      );

      await trx.commit();
      return result;
    } catch (error) {
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

  // Endpoint untuk mengambil data cuti berdasarkan pagination
  @Get()
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

    filters.karyawan_id = req.user.user.karyawan_id;

    // Sort params default
    const sortParams = {
      sortBy: sortBy || 'modifiedby',
      sortDirection: sortDirection || 'asc',
    };

    // Pagination
    const pagination = {
      page: page || 1,
      limit: limit === 0 || !limit ? undefined : limit,
    };

    // Memasukkan semua data dalam params untuk dikirimkan ke service
    const params: FindAllParams = {
      search,
      filters, // Filters sudah disertakan karyawan_id dan year (jika ada)
      pagination,
      isLookUp: isLookUp === 'true',
      sort: sortParams as { sortBy: string; sortDirection: 'asc' | 'desc' },
    };

    return this.cutiService.findAll(params);
  }
  @Post('report-byselect')
  @UseGuards(AuthGuard)
  async findAllByIds(@Req() req, @Body() ids: { id: number }[]) {
    const karyawan_id = req.user.user.karyawan_id;
    return this.cutiService.findAllByIds(ids, karyawan_id);
  }

  @Get('approval-cuti')
  //@APPROVAL-CUTI
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAllApprovalCuti(@Req() req, @Query() query: FindAllDto) {
    const trx = await dbMssql.transaction();
    try {
      const {
        search,
        page,
        limit,
        sortBy,
        sortDirection,
        isLookUp,
        ...filters
      }: { [key: string]: any } = query;

      // Menambahkan karyawan_id ke dalam filters berdasarkan user yang terautentikasi
      filters.karyawan_id = req.user.user.karyawan_id;

      // Sort params default
      const sortParams = {
        sortBy: sortBy || 'modifiedby',
        sortDirection: sortDirection || 'asc',
      };

      // Pagination
      const pagination = {
        page: page || 1,
        limit: limit === 0 || !limit ? undefined : limit,
      };

      // Memasukkan semua data dalam params untuk dikirimkan ke service
      const params: FindAllParams = {
        search,
        filters, // Filters sudah disertakan karyawan_id
        pagination,
        isLookUp: isLookUp === 'true',
        sort: sortParams as { sortBy: string; sortDirection: 'asc' | 'desc' },
      };
      const response = await this.cutiService.findCutiApproval(
        params,
        filters.isproses,
        trx,
      );

      await trx.commit();
      return response;
    } catch (error) {
      await trx.rollback();
      console.error('Error during transaction:', error);
      throw error; // Rethrow the error for further handling
    }
  }

  @Get('/export')
  @UseGuards(AuthGuard)
  async exportToExcel(@Req() req, @Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(req, params);
      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.cutiService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_cuti.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Post('/export-byselect')
  @UseGuards(AuthGuard)
  async exportToExcelBySelect(
    @Req() req,
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.cutiService.findAllByIds(
        ids,
        req.user.user.karyawan_id,
      );

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.cutiService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_cuti.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Get(':id')
  async getDetail(@Param('id') id: number) {
    return await this.cutiService.getDetailCuti(id);
  }

  @Put('cancel-cuti/:id')
  async updateStatusApproval(@Param('id') cutiId: number) {
    const trx = await dbMssql.transaction();
    const existing = await dbMssql('cutiapproval')
      .select('statusapproval')
      .where('cuti_id', cutiId)
      .first();
    if (existing?.statusapproval === 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI APPROVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing?.statusapproval === 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI TOLAK',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing?.statusapproval === 3) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'CUTI SUDAH DI BATALKAN',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const updated = await this.cutiService.cancel(cutiId, trx);
      await trx.commit();
      return {
        message: `Status cuti for cuti_id ${cutiId} updated successfully`,
        updated,
      };
    } catch (error) {
      await trx.rollback();
      throw new HttpException(
        `Error Approve Cuti: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
