import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { RekapsaldocutiService } from './rekapsaldocuti.service';
import { CreateRekapsaldocutiDto } from './dto/create-rekapsaldocuti.dto';
import { UpdateRekapsaldocutiDto } from './dto/update-rekapsaldocuti.dto';
import { dbMssql } from 'src/common/utils/db';

@Controller('rekapsaldocuti')
export class RekapsaldocutiController {
  constructor(private readonly rekapsaldocutiService: RekapsaldocutiService) {}
  @Get()
  async getRekapKeterlambatan(
    @Query()
    query: {
      pidcabang: number;
      ptahun: string;
      pkaryawanid: string;
    },
  ) {
    const { pidcabang, ptahun, pkaryawanid } = query;

    // Start the transaction
    const trx = await dbMssql.transaction();

    try {
      // Call the service method to process the data
      const result = await this.rekapsaldocutiService.rekapSaldoCuti(
        pidcabang,
        ptahun,
        pkaryawanid,
        trx,
      );

      // Commit the transaction if everything goes well
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback the transaction in case of error
      await trx.rollback();
      throw error; // Re-throw the error to handle it further up the stack
    }
  }

  @Get()
  @Post()
  create(@Body() createRekapsaldocutiDto: CreateRekapsaldocutiDto) {
    return this.rekapsaldocutiService.create(createRekapsaldocutiDto);
  }

  @Get('kartucuti')
  async getRekapSaldoCuti(@Query() query: { ptgltransaksi: string }) {
    const { ptgltransaksi } = query;
    // Start the transaction
    const trx = await dbMssql.transaction();

    try {
      // Call the service method to process the data
      const result = await this.rekapsaldocutiService.rekapkartucuti(
        ptgltransaksi,
        trx,
      );

      // Commit the transaction if everything goes well
      await trx.commit();

      return result;
    } catch (error) {
      // Rollback the transaction in case of error
      await trx.rollback();
      throw error; // Re-throw the error to handle it further up the stack
    }
  }

  findAll() {
    return this.rekapsaldocutiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rekapsaldocutiService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRekapsaldocutiDto: UpdateRekapsaldocutiDto,
  ) {
    return this.rekapsaldocutiService.update(+id, updateRekapsaldocutiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rekapsaldocutiService.remove(+id);
  }
}
