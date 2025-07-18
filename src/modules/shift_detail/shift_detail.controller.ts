import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Req,
} from '@nestjs/common';
import { ShiftDetailService } from './shift_detail.service';
import { CreateShiftDetailDto } from './dto/create-shift_detail.dto';
import { UpdateShiftDetailDto } from './dto/update-shift_detail.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';

@Controller('shift-detail')
export class ShiftDetailController {
  constructor(private readonly shiftDetailService: ShiftDetailService) {}

  @Put(':id')
  @UseGuards(AuthGuard)
  async createKaryawanNomorDarurat(
    @Param('id') id: number,
    @Req() req,
    @Body() data: any, // This will hold the validated request body
  ) {
    const trx = await dbMssql.transaction();
    try {
      // Get the modifiedby value from the request user
      const modifiedby = req.user?.user?.username || 'unknown';
      // Call the create method and pass modifiedby as a parameter
      const result = await this.shiftDetailService.create(
        data,
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

  @Get(':shift_id')
  async findAll(@Param('shift_id') shift_id: number) {
    const data = await this.shiftDetailService.findAll(shift_id);

    // Check if data is empty or not found
    if (isNaN(shift_id)) {
      return { status: false, message: 'Invalid user ID format', data: [] }; // Return a proper message when the ID format is invalid
    }
    return data;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shiftDetailService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateShiftDetailDto: UpdateShiftDetailDto,
  ) {
    return this.shiftDetailService.update(+id, updateShiftDetailDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shiftDetailService.remove(+id);
  }
}
