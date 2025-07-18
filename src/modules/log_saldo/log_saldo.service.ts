import { Injectable } from '@nestjs/common';
import { CreateLogSaldoDto } from './dto/create-log_saldo.dto';
import { UpdateLogSaldoDto } from './dto/update-log_saldo.dto';

@Injectable()
export class LogSaldoService {
  create(data: any, trx: any) {
    try {
      if (!data.tanggal || data.tanggal === '') {
        data.tanggal = null;
      } else if (typeof data.tanggal === 'string') {
        // Misal data.tanggal = "25-06-2002"
        const [day, month, year] = data.tanggal.split('-');
        // Hasil = "2002-06-25"
        data.tanggal = `${year}-${month}-${day}`;
      }
      const result = trx('log_saldo').insert(data);
      return result;
    } catch (error) {
      console.error('Error creating logSaldo:', error);
      throw error; // Rethrow the error to handle it further up the stack
    }
  }

  findAll() {
    return `This action returns all logSaldo`;
  }

  findOne(id: number) {
    return `This action returns a #${id} logSaldo`;
  }

  update(id: number, updateLogSaldoDto: UpdateLogSaldoDto) {
    return `This action updates a #${id} logSaldo`;
  }

  remove(id: number) {
    return `This action removes a #${id} logSaldo`;
  }
}
