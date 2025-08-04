import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  InternalServerErrorException,
  Req,
  UseGuards,
  Put,
} from '@nestjs/common';
import { CreateUsercabangDto } from './dto/create-usercabang.dto';
import { UpdateUsercabangDto } from './dto/update-usercabang.dto';
import { dbMssql } from 'src/common/utils/db';
import { AuthGuard } from '../auth/auth.guard';
import { UsercabangService } from './usercabang.service';

@Controller('usercabang')
export class UsercabangController {
  constructor(private readonly usercabangService: UsercabangService) {}

  @Post()
  create(@Body() createUsercabangDto: CreateUsercabangDto) {
    return this.usercabangService.create(createUsercabangDto);
  }

  @Get(':id')
  findAll(@Param('id') id: string) {
    return this.usercabangService.findAll(+id);
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    data: any,
    @Req() req: any,
  ) {
    const modifiedBy = req.user?.user?.username || 'unknown';

    const trx = await dbMssql.transaction();

    try {
      const result = await this.usercabangService.update(
        Number(+id),
        data,
        modifiedBy,
        trx,
      );

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating user roles:', error);
      throw new InternalServerErrorException('Failed to update user roles');
    }
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usercabangService.remove(+id);
  }
}
