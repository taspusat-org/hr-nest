import { Controller, Get, Query } from '@nestjs/common';
import { RunningNumberService } from './running-number.service';

@Controller('running-number')
export class RunningNumberController {
  constructor(private readonly runningNumberService: RunningNumberService) {}

  @Get('generate')
  async generateRunningNumber(
    @Query('group') group: string,
    @Query('subGroup') subGroup: string,
    @Query('table') table: string,
    @Query('tgl') tgl: string,
    @Query('tujuan') tujuan: string | null,
    @Query('cabang') cabang: string | null,
    @Query('jenisbiaya') jenisbiaya: string | null,
    @Query('marketing') marketing: string | null,
  ): Promise<string> {
    return await this.runningNumberService.generateRunningNumber(
      null, // transaction if you need one
      group,
      subGroup,
      table,
      tgl,
      tujuan,
      cabang,
      jenisbiaya,
      marketing,
    );
  }
}
