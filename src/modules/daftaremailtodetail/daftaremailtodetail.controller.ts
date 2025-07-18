import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { DaftaremailtodetailService } from './daftaremailtodetail.service';
import { CreateDaftaremailtodetailDto } from './dto/create-daftaremailtodetail.dto';
import { UpdateDaftaremailtodetailDto } from './dto/update-daftaremailtodetail.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';

@Controller('daftaremailtodetail')
export class DaftaremailtodetailController {
  constructor(
    private readonly daftaremailtodetailService: DaftaremailtodetailService,
  ) {}

  @Put(':id')
  @UseGuards(AuthGuard)
  async createKaryawanNomorDarurat(
    @Param('id') id: number,
    @Req() req,
    @Body() daftaremailtodetail: any, // This will hold the validated request body
  ) {
    const trx = await dbMssql.transaction();
    try {
      // Get the modifiedby value from the request user
      const modifiedby = req.user?.user?.username || 'unknown';
      // Call the create method and pass modifiedby as a parameter
      const result = await this.daftaremailtodetailService.create(
        daftaremailtodetail,
        modifiedby,
        id,
        trx,
      );

      await trx.commit();

      return { data: result };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
  @Get(':daftaremail_id')
  async findAll(@Param('daftaremail_id') daftaremail_id: number) {
    const data = await this.daftaremailtodetailService.findAll(daftaremail_id);

    // If no data found, throw a NotFoundException
    if (Array.isArray(data) && data.length === 0) {
      throw new NotFoundException(
        'No educational data found for this employee',
      );
    }

    return data;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.daftaremailtodetailService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDaftaremailtodetailDto: UpdateDaftaremailtodetailDto,
  ) {
    return this.daftaremailtodetailService.update(
      +id,
      updateDaftaremailtodetailDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.daftaremailtodetailService.remove(+id);
  }
}
