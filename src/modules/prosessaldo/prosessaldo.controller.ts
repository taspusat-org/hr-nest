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
import { ProsessaldoService } from './prosessaldo.service';
import { CreateProsessaldoDto } from './dto/create-prosessaldo.dto';
import { UpdateProsessaldoDto } from './dto/update-prosessaldo.dto';
import { dbMssql } from 'src/common/utils/db';

@Controller('prosessaldo')
export class ProsessaldoController {
  constructor(private readonly prosessaldoService: ProsessaldoService) {}
  @Get()
  async prosesSaldoAwal(
    @Query('ptgl') ptgl: string,
  ): Promise<{ message: string }> {
    const trx = await dbMssql.transaction();
    try {
      const [day, month, year] = ptgl.split('-'); // Misal ptgl = '24-06-2025'
      const formattedPtgl = `${year}-${month}-${day}`; // Format menjadi '2025-06-24'
      // Menghapus data dari table saldocuti yang memiliki created_at yang sama dengan ptgl
      await trx('saldocuti')
        .whereRaw('CONVERT(VARCHAR, created_at, 120) LIKE ?', [
          `${formattedPtgl}%`,
        ]) // Gunakan LIKE untuk mencocokkan tanggal
        .del(); // Menghapus data sesuai dengan ptgl yang diberikan
      // Menghapus data dari table saldocuti yang memiliki created_at yang sama dengan ptgl
      await trx('kartucuti')
        .where('tgltransaksi', formattedPtgl)
        .andWhere('jenistransaksi', 'SALDOAWAL')
        .del(); // Menghapus data sesuai dengan ptgl yang diberikan

      // Langkah 2: Jalankan prosesSaldo setelah menghapus data
      await this.prosessaldoService.prosesSaldo(ptgl, trx);
      await this.prosessaldoService.prosesSaldoKartuCuti(ptgl, trx);
      trx.commit();
      return { message: 'Proses saldo successfully executed.' };
    } catch (error) {
      trx.rollback();
      throw error; // Re-throw the error to handle it further up the stack
    }
  }

  @Get()
  findAll() {
    return this.prosessaldoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prosessaldoService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProsessaldoDto: UpdateProsessaldoDto,
  ) {
    return this.prosessaldoService.update(+id, updateProsessaldoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prosessaldoService.remove(+id);
  }
}
