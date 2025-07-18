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
  Req,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { KaryawanMutasiService } from './karyawan_mutasi.service';
import { CreateKaryawanMutasiDto } from './dto/create-karyawan_mutasi.dto';
import { UpdateKaryawanMutasiDto } from './dto/update-karyawan_mutasi.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('karyawan-mutasi')
export class KaryawanMutasiController {
  constructor(private readonly karyawanMutasiService: KaryawanMutasiService) {}

  @Post()
  //@KARYAWAN-MUTASI
  @UseGuards(AuthGuard)
  async create(@Body() data: any, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      data.modifiedby = req.user?.user?.username || 'unknown';
      const result = await this.karyawanMutasiService.create(data, trx);

      // Jika semuanya sukses, commit transaksi
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error:', error);

      // Return a better-formatted error response
      throw new HttpException(
        {
          status: 'error',
          message: error.message || 'Something went wrong',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  //@KARYAWAN-MUTASI
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

    return this.karyawanMutasiService.findAll(params);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.karyawanMutasiService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateKaryawanMutasiDto: UpdateKaryawanMutasiDto,
  ) {
    return this.karyawanMutasiService.update(+id, updateKaryawanMutasiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.karyawanMutasiService.remove(+id);
  }
}
