import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  UseGuards,
  Query,
  Req,
  Put,
  NotFoundException,
  InternalServerErrorException,
  Res,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IzinService } from './izin.service';
import { CreateIzinDto, CreateIzinSchema } from './dto/create-izin.dto';
import { UpdateIzinDto } from './dto/update-izin.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';
@Controller('izin')
export class IzinController {
  constructor(private readonly izinService: IzinService) {}

  @UseGuards(AuthGuard)
  @Post()
  //@IZIN
  async create(
    @Body(new ZodValidationPipe(CreateIzinSchema)) data: CreateIzinDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();

    const hariLibur = await trx('harilibur')
      .select('*')
      .where({ cabang_id: req.user.cabang_id }); // Daftar hari libur
    const izinList = await trx('izin')
      .where('karyawan_id', data.karyawan_id)
      .andWhere('statusizin', 150) // Status 0 means pending approval
      .select('id as izin_id');

    if (izinList.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Masih ada Izin yang belum di-approve',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Retrieve batasizin value from the 'parameter' table (expected to be a number of days, like 30)
    const batasizin = await trx('parameter')
      .select('text') // Assuming the 'text' field stores the number of days allowed for izin
      .where({ grp: 'BATASIZIN' });

    if (batasizin.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Batas izin tidak ditemukan.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const batasIzinValue = parseInt(batasizin[0].text, 10); // Parse the batasizin value as an integer (e.g., 30)

    // Get today's date and calculate the date range based on batasIzinValue (both forward and backward)
    const today = new Date();
    const daysInMilliseconds = batasIzinValue * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    const oneMonthBefore = new Date(today.getTime() - daysInMilliseconds); // 'batasIzinValue' days before today
    const oneMonthAfter = new Date(today.getTime() + daysInMilliseconds); // 'batasIzinValue' days after today

    // Validate tglizin (convert DD-MM-YYYY format to Date)
    if (!data.tglizin) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Tanggal izin tidak valid.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const [day, month, year] = data.tglizin.split('-'); // Destructure the date (DD, MM, YYYY)
    const tglizinDate = new Date(`${year}-${month}-${day}T00:00:00Z`); // Reformat to YYYY-MM-DD (ISO format)

    if (tglizinDate < oneMonthBefore || tglizinDate > oneMonthAfter) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Tanggal izin harus berada dalam rentang ${batasIzinValue} hari ke depan atau belakang.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate if tglizin is a holiday
    const isHoliday = hariLibur.some((libur) => {
      const liburDate = new Date(libur.tgl); // Assuming the 'tanggal' field stores the holiday dat
      // Extract only the date part (ignore the time) and compare
      return (
        liburDate.toISOString().split('T')[0] ===
        tglizinDate.toISOString().split('T')[0]
      );
    });

    if (isHoliday) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'TIDAK BOLEH MENGAJUKAN IZIN DI HARI LIBUR',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate if tglizin is a Sunday (Minggu)
    const isSunday = tglizinDate.getDay() === 0; // 0 represents Sunday
    if (isSunday) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'TIDAK BOLEH MENGAJUKAN IZIN DI HARI MINGGU',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!data.tglizin || data.tglizin === '') {
      data.tglizin = null;
    } else if (typeof data.tglizin === 'string') {
      // Misal data.tglizin = "25-06-2002"
      const [day, month, year] = data.tglizin.split('-');
      // Hasil = "2002-06-25"
      data.tglizin = `${year}-${month}-${day}`;
    }
    // Check for unDISETUJUI izin for the same karyawan_id
    // Check if there's already an izin with the same tglizin and statusizin 151
    const existingIzin = await trx('izin')
      .where('tglizin', data.tglizin) // Make sure tglizin is passed in the data
      .andWhere('statusizin', 151)
      .select('id as izin_id');

    if (existingIzin.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Anda sudah pernah mengajukan izin pada tanggal ini',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const modifiedby = req.user?.user?.username || 'unknown';
      const result = await this.izinService.create(data, trx, modifiedby);

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
          message: 'Gagal Mengajukan izin',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  convertDateFormat(date: string): string {
    const [day, month, year] = date.split('-'); // Split by dash
    return `${year}-${month}-${day}`; // Format ulang menjadi yyyy-mm-dd
  }
  @Get('rekap')
  //@REKAP-IZIN-KARYAWAN
  @UseGuards(AuthGuard)
  async rekapIzinData(
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
    const formattedTanggalDari = this.convertDateFormat(tanggalDari);
    const formattedTanggalSampai = this.convertDateFormat(tanggalSampai);

    const trx = await dbMssql.transaction();
    try {
      const result = await this.izinService.rekapIzinData(
        Number(idcabang),
        formattedTanggalDari,
        formattedTanggalSampai,
        trx,
      );
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new InternalServerErrorException(
        'Terjadi kesalahan saat memproses data',
      );
    }
    // Konversi tanggal dari dd-mm-yyyy menjadi yyyy-mm-dd

    // Memanggil service dengan parameter tanggal dari dan tanggal sampai yang sudah diformat
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
      const result = await this.izinService.rekapIzinData(
        Number(idcabang),
        formattedTanggalDari,
        formattedTanggalSampai,
        trx, // Menggunakan transaksi dalam service
      );

      // Commit transaksi jika tidak ada error
      await trx.commit();

      // Mengekspor data ke Excel
      const tempFilePath = await this.izinService.exportToExcelRekap(result);

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
    }
  }

  @Get()
  @UseGuards(AuthGuard)

  //@IZIN
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
    const sortParams = {
      sortBy: sortBy || 'karyawan_nama',
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

    return this.izinService.findAll(params);
  }

  @UseGuards(AuthGuard)
  @Post('check-izin')
  async checkAddIzin(@Body() data: any) {
    const trx = await dbMssql.transaction();

    try {
      // Mengecek apakah data cuti dan approval sudah ada
      const existing = await trx('izin')
        .where('karyawan_id', data.karyawan_id)
        .andWhere('statusizin', 150)
        .first();

      if (existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message:
            'TIDAK BISA MENGAJUKAN izin, MASIH ADA izin YANG BELUM DI SETUJUI',
        };
      }

      // Menangani kondisi jika status sudah di-approve, ditolak, atau dibatalkan

      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'izin dapat diproses',
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
      const existing = await trx('izinapproval')
        .select('statusapproval', 'jenjangapproval')
        .where('izin_id', data.id)
        .andWhere('karyawan_id', data.karyawan_id)
        .first();

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-approve, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 151:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI SETUJUI',
          };
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }

      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Izin dapat diproses',
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
      const existing = await trx('izinapproval')
        .select('statusapproval')
        .where('izin_id', data.id)
        .andWhere('karyawan_id', data.karyawan_id)
        .first();

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-approve, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 151:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI SETUJUI',
          };
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }
      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Izin dapat diproses',
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
      const existing = await trx('izinapproval')
        .select('statusapproval')
        .where('izin_id', data.id)
        .andWhere('karyawan_id', data.karyawan_id)
        .first();

      if (!existing) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Data approval tidak ditemukan',
        };
      }

      // Menangani kondisi jika status sudah di-approve, ditolak, atau dibatalkan
      switch (existing.statusapproval) {
        case 152:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI TOLAK',
          };
        case 153:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'IZIN SUDAH DI BATALKAN',
          };
        default:
          // Jika status tidak memenuhi syarat di atas, lanjutkan proses
          break;
      }
      await trx.commit();

      return {
        statusCode: HttpStatus.OK,
        message: 'Izin dapat diproses',
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
  @Put(':id')
  //@IZIN
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateIzinSchema)) data: CreateIzinDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();

    // Check if the izin with the same tglizin and statusizin 151 exists

    const batasizin = await trx('parameter')
      .select('text') // Assuming the 'text' field stores the number of days allowed for izin
      .where({ grp: 'BATASIZIN' });

    if (batasizin.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Batas izin tidak ditemukan.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const batasIzinValue = parseInt(batasizin[0].text, 10); // Parse the batasizin value as an integer (e.g., 30)

    // Get today's date and calculate the date range based on batasIzinValue (both forward and backward)
    const today = new Date();
    const daysInMilliseconds = batasIzinValue * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    const oneMonthBefore = new Date(today.getTime() - daysInMilliseconds); // 'batasIzinValue' days before today
    const oneMonthAfter = new Date(today.getTime() + daysInMilliseconds); // 'batasIzinValue' days after today

    // Check if tglizin is within the allowed range
    if (!data.tglizin) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Tanggal izin tidak valid.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const tglizinString = data.tglizin; // Assuming data.tglizin is in the format "dd-mm-yyyy"

    // Split the date string into day, month, and year
    const [day, month, year] = tglizinString.split('-');

    // Construct the date string in "yyyy-mm-dd" format
    const formattedDateString = `${year}-${month}-${day}`;

    // Convert the formatted string to a Date object
    const tglizinDate = new Date(formattedDateString + 'T00:00:00Z'); // Ensure it's i
    if (tglizinDate < oneMonthBefore || tglizinDate > oneMonthAfter) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Tanggal izin harus berada dalam rentang ${batasIzinValue} hari ke depan atau belakang.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    // Check if the izin has been processed and cannot be updated
    const checkIzinDISETUJUI = await trx('izinapproval')
      .where('izin_id', id)
      .andWhere('statusapproval', 151) // Status 0 means pending approval
      .select('id');

    if (checkIzinDISETUJUI.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Izin Sudah di-proses oleh atasan, tidak bisa diubah, silahkan ajukan ulang izin',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!data.tglizin || data.tglizin === '') {
      data.tglizin = null;
    } else if (typeof data.tglizin === 'string') {
      // Misal data.tglizin = "25-06-2002"
      const [day, month, year] = data.tglizin.split('-');
      // Hasil = "2002-06-25"
      data.tglizin = `${year}-${month}-${day}`;
    }
    const existingIzin = await trx('izin')
      .where('tglizin', data.tglizin) // Check if the tglizin already exists in the table
      .andWhere('statusizin', 151)
      .andWhere('id', '!=', id) // Exclude the current record (prevent checking itself)
      .select('id as izin_id');

    if (existingIzin.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Anda Sudah pernah mengajukan izin pada tanggal ini',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      data.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.izinService.update(+id, data, trx);

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

  @Delete(':id')
  //@IZIN
  async delete(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.izinService.delete(+id, trx);

      if (result.status === 404) {
        throw new NotFoundException(result.message);
      }

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error deleting menu in controller:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to delete menu');
    }
  }
  @Get('approval-izin')
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAllApprovalIzin(@Req() req, @Query() query: FindAllDto) {
    const {
      search,
      page,
      limit,
      sortBy,
      sortDirection,
      isLookUp,
      ...filters
    }: { [key: string]: any } = query;

    // Menambahkan karyawan_id ke dalam params berdasarkan user yang terautentikasi
    const karyawanId = req.user.user.karyawan_id;

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
      filters, // Filters tidak menyertakan karyawan_id
      pagination,
      isLookUp: isLookUp === 'true',
      sort: sortParams as { sortBy: string; sortDirection: 'asc' | 'desc' },
      karyawanId, // Menambahkan karyawan_id langsung ke dalam params
    };

    return this.izinService.findIzinApproval(params);
  }

  @Get('/export')
  @UseGuards(AuthGuard)
  async exportToExcel(@Req() req, @Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(req, params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.izinService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_menu.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }
  @Post('report-byselect')
  @UseGuards(AuthGuard)
  async findAllByIds(@Req() req, @Body() ids: { id: number }[]) {
    return this.izinService.findAllByIds(ids);
  }
  @Post('/export-byselect')
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.izinService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.izinService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_menu.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Put('cancel-izin/:id')
  async updateStatusApproval(@Param('id') izinId: number) {
    const trx = await dbMssql.transaction();
    const existing = await dbMssql('izinapproval')
      .select('statusapproval')
      .where('izin_id', izinId)
      .first();

    if (existing?.statusapproval === 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'IZIN SUDAH DI SETUJUI',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing?.statusapproval === 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'IZIN SUDAH DI TOLAK',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (existing?.statusapproval === 3) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'IZIN SUDAH DI BATALKAN',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const updated = await this.izinService.cancel(izinId, trx);
      await trx.commit();
      return {
        message: `Status izin for IZIN ${izinId} updated successfully`,
        updated,
      };
    } catch (error) {
      await trx.rollback();
      throw new HttpException(
        `Error Approve izin: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  @Get(':id')
  //@IZIN
  findOne(@Param('id') id: string) {
    return this.izinService.findOne(+id);
  }
}
