import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LogabsensiService } from './logabsensi.service';
import { CreateLogabsensiDto } from './dto/create-logabsensi.dto';
import { UpdateLogabsensiDto } from './dto/update-logabsensi.dto';

@Controller('logabsensi')
export class LogabsensiController {
  constructor(private readonly logabsensiService: LogabsensiService) {}

  @Post()
  //@REKAP-ABSENSI
  create(@Body() createLogabsensiDto: CreateLogabsensiDto) {
    return this.logabsensiService.create(createLogabsensiDto);
  }

  @Get()
  //@REKAP-ABSENSI
  findAll() {
    return this.logabsensiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.logabsensiService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLogabsensiDto: UpdateLogabsensiDto,
  ) {
    return this.logabsensiService.update(+id, updateLogabsensiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.logabsensiService.remove(+id);
  }
}
