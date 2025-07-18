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
} from '@nestjs/common';
import { ApprovaldetailService } from './approvaldetail.service';
import { CreateApprovaldetailDto } from './dto/create-approvaldetail.dto';
import { UpdateApprovaldetailDto } from './dto/update-approvaldetail.dto';
import { AuthGuard } from '../auth/auth.guard';
import { dbMssql } from 'src/common/utils/db';

@Controller('approvaldetail')
export class ApprovaldetailController {
  constructor(private readonly approvaldetailService: ApprovaldetailService) {}

  @Put(':id')
  @UseGuards(AuthGuard)
  async createKaryawanNomorDarurat(
    @Param('id') id: number,
    @Req() req,
    @Body() updateData: any, // This will hold the validated request body
  ) {
    const trx = await dbMssql.transaction();
    try {
      const modifiedby = req.user?.user?.username || 'unknown';
      // Call the create method and pass modifiedby as a parameter
      const result = await this.approvaldetailService.create(
        updateData,
        id,
        trx,
        modifiedby,
      );

      await trx.commit();

      return { data: result };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.approvaldetailService.findById(+id, trx);
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
    @Body() updateApprovaldetailDto: UpdateApprovaldetailDto,
  ) {
    return this.approvaldetailService.update(+id, updateApprovaldetailDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.approvaldetailService.remove(+id);
  }
}
