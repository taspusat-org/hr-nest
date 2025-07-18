import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CutidetailService } from './cutidetail.service';
import { CreateCutidetailDto } from './dto/create-cutidetail.dto';
import { UpdateCutidetailDto } from './dto/update-cutidetail.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { dbMssql } from 'src/common/utils/db';

@Controller('cutidetail')
export class CutidetailController {
  constructor(private readonly cutidetailService: CutidetailService) {}

  @Get()
  findAll() {
    return this.cutidetailService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.cutidetailService.findByCutiId(+id, trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCutidetailDto: UpdateCutidetailDto,
  ) {
    return this.cutidetailService.update(+id, updateCutidetailDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cutidetailService.remove(+id);
  }
}
