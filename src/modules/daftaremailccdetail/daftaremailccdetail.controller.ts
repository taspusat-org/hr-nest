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
import { DaftaremailccdetailService } from './daftaremailccdetail.service';
import { CreateDaftaremailccdetailDto } from './dto/create-daftaremailccdetail.dto';
import { UpdateDaftaremailccdetailDto } from './dto/update-daftaremailccdetail.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';

@Controller('daftaremailccdetail')
export class DaftaremailccdetailController {
  constructor(
    private readonly daftaremailccdetailService: DaftaremailccdetailService,
  ) {}

  @Put(':id')
  @UseGuards(AuthGuard)
  async createKaryawanNomorDarurat(
    @Param('id') id: number,
    @Req() req,
    @Body() daftaremailccdetail: any, // This will hold the validated request body
  ) {
    const trx = await dbMssql.transaction();
    try {
      // Get the modifiedby value from the request user
      const modifiedby = req.user?.user?.username || 'unknown';
      // Call the create method and pass modifiedby as a parameter
      const result = await this.daftaremailccdetailService.create(
        daftaremailccdetail,
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
    const data = await this.daftaremailccdetailService.findAll(daftaremail_id);

    // If no data found, throw a NotFoundException
    if (Array.isArray(data) && data.length === 0) {
      throw new NotFoundException(
        'No educational data found for this employee',
      );
    }

    return data;
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDaftaremailccdetailDto: UpdateDaftaremailccdetailDto,
  ) {
    return this.daftaremailccdetailService.update(
      +id,
      updateDaftaremailccdetailDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.daftaremailccdetailService.remove(+id);
  }
}
