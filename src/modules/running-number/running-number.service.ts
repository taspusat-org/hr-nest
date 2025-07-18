import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { dbMssql } from 'src/common/utils/db';
import { Repository } from 'typeorm';

@Injectable()
export class RunningNumberService {
  async getLastNumber(
    trx: any,
    table: string,
    year: number,
    month: number,
    type: string,
    statusformat: string,
  ) {
    if (type === 'RESET BULAN') {
      return trx(table)
        .forUpdate()
        .where('tglbukti', '>=', `${year}-${month}-01`)
        .andWhere('tglbukti', '<', `${year}-${month + 1}-01`)
        .andWhere('statusformat', statusformat)
        .orderBy('nobukti', 'desc')
        .first();
    }

    if (type === 'RESET TAHUN') {
      return trx(table)
        .forUpdate()
        .where('tglbukti', '>=', `${year}-01-01`)
        .andWhere('tglbukti', '<', `${year + 1}-01-01`)
        .andWhere('statusformat', statusformat)
        .orderBy('nobukti', 'desc')
        .first();
    }

    return trx(table)
      .forUpdate()
      .select('nobukti')
      .where('statusformat', statusformat)
      .orderBy('nobukti', 'desc')
      .first();
  }

  async saveRunningNumber(
    table: string,
    data: { nobukti: string; tglbukti: string; statusformat: string },
  ) {
    return dbMssql(table).insert(data);
  }

  async generateRunningNumber(
    trx: any,
    group: string,
    subGroup: string,
    table: string,
    tgl: string,
    tujuan: string | null,
    cabang: string | null,
    jenisbiaya: string | null,
    marketing: string | null,
  ): Promise<string> {
    const date = new Date(tgl);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Ambil parameter format dari database
    const parameter = await dbMssql('parameter')
      .select('id', 'text', 'type')
      .where('grp', group)
      .andWhere('subgrp', subGroup)
      .first();
    if (!parameter) {
      throw new Error('Parameter tidak ditemukan!');
    }

    const format = parameter.text;
    const type = parameter.type || '';

    // Ambil nomor terakhir
    const lastRowData = await this.getLastNumber(
      trx,
      table,
      year,
      month,
      type,
      parameter.id,
    );

    let lastCounter = 0;
    if (lastRowData?.nobukti) {
      const match = lastRowData.nobukti.match(/(\d+)(?=\/)/);
      if (match) {
        lastCounter = parseInt(match[0], 10);
      }
    }

    const placeholders = {
      '9999': lastCounter + 1,
      R: this.numberToRoman(month),
      Y: year,
    };

    // Format nomor bukti
    const runningNumber = this.formatNumber(format, placeholders);

    await this.saveRunningNumber(table, {
      nobukti: runningNumber,
      tglbukti: tgl,
      statusformat: parameter.id,
    });

    return runningNumber;
  }

  numberToRoman(num: number): string {
    const romanMap = [
      { value: 1000, numeral: 'M' },
      { value: 900, numeral: 'CM' },
      { value: 500, numeral: 'D' },
      { value: 400, numeral: 'CD' },
      { value: 100, numeral: 'C' },
      { value: 90, numeral: 'XC' },
      { value: 50, numeral: 'L' },
      { value: 40, numeral: 'XL' },
      { value: 10, numeral: 'X' },
      { value: 9, numeral: 'IX' },
      { value: 5, numeral: 'V' },
      { value: 4, numeral: 'IV' },
      { value: 1, numeral: 'I' },
    ];

    return romanMap.reduce((acc, { value, numeral }) => {
      const count = Math.floor(num / value);
      num %= value;
      return acc + numeral.repeat(count);
    }, '');
  }

  formatNumber(format: string, placeholders: { [key: string]: any }): string {
    let formatted = format;

    // Replace placeholders
    for (const [placeholder, value] of Object.entries(placeholders)) {
      const regex = new RegExp(`${placeholder}`, 'g');
      if (placeholder === '9999') {
        formatted = formatted.replace(regex, value.toString().padStart(4, '0'));
      } else {
        formatted = formatted.replace(regex, value.toString());
      }
    }

    // Clean up any remaining '#' characters
    formatted = formatted.replace(/#/g, '');

    return formatted;
  }
}
