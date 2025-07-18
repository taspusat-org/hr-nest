import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Put,
  NotFoundException,
  InternalServerErrorException,
  UsePipes,
  Query,
  Res,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateMenuDto, CreateMenuSchema } from './dto/create-menu.dto';
import { dbMssql } from 'src/common/utils/db';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateMenuDto, UpdateMenuSchema } from './dto/update-menu.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  FindAllDto,
  FindAllParams,
  FindAllSchema,
} from 'src/common/interfaces/all.interface';
import { Response } from 'express';
import * as fs from 'fs';
import { KeyboardOnlyValidationPipe } from 'src/common/pipes/keyboardonly-validation.pipe';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}
  @Get('sidebar')
  menuSidebar(@Query('userId') userId: number) {
    return this.menuService.getMenuSidebar(userId);
  }
  @Get('menu-sidebar')
  menuSidebarUser(@Query('userId') userId: number) {
    return this.menuService.getDataMenuSidebar(userId);
  }
  @Get('menu-resequence')
  menuResequence() {
    return this.menuService.getMenuResequence();
  }
  @Post('search')
  async getSearchMenu(
    @Body() { userId, search }: { userId: number; search: string },
  ) {
    try {
      const menus = await this.menuService.getSearchMenu(userId, search);
      return menus;
    } catch (error) {
      console.error('Error searching menu:', error);
      throw new InternalServerErrorException('Failed to fetch search menus');
    }
  }

  @UseGuards(AuthGuard)
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateMenuSchema), KeyboardOnlyValidationPipe)
    data: CreateMenuDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      data.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.menuService.create(data, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw new Error(`Error creating menu: ${error.message}`);
    }
  }

  @Post('report-byselect')
  async findAllByIds(@Body() ids: { id: number }[]) {
    return this.menuService.findAllByIds(ids);
  }

  @Get()
  @UsePipes(new ZodValidationPipe(FindAllSchema))
  async findAll(@Query() query: FindAllDto) {
    const { search, page, limit, sortBy, sortDirection, isLookUp, ...filters } =
      query;

    const sortParams = {
      sortBy: sortBy || 'title',
      sortDirection: sortDirection || 'asc',
    };

    const pagination = {
      page: page || 1,
      limit: limit === 0 || !limit ? undefined : limit,
    };

    const params: FindAllParams = {
      search,
      filters,
      pagination,
      sort: sortParams as { sortBy: string; sortDirection: 'asc' | 'desc' },
      isLookUp: isLookUp === 'true',
    };

    return this.menuService.findAll(params);
  }

  @Get('/export')
  async exportToExcel(@Query() params: any, @Res() res: Response) {
    try {
      const { data } = await this.findAll(params);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.menuService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_menu.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Post('/export-byselect')
  async exportToExcelBySelect(
    @Body() ids: { id: number }[],
    @Res() res: Response,
  ) {
    try {
      const data = await this.menuService.findAllByIds(ids);

      if (!Array.isArray(data)) {
        throw new Error('Data is not an array or is undefined.');
      }

      const tempFilePath = await this.menuService.exportToExcel(data);

      const fileStream = fs.createReadStream(tempFilePath);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="laporan_menu.xlsx"',
      );

      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      res.status(500).send('Failed to export file');
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.menuService.getById(+id, trx);
      if (!result) {
        throw new Error('Data not found');
      }

      await trx.commit();
      return result;
    } catch (error) {
      console.error('Error fetching data by id:', error);

      await trx.rollback();
      throw new Error('Failed to fetch data by id');
    }
  }

  @UseGuards(AuthGuard)
  @Put('update-resequence')
  async updateMenuResequence(@Body() body: { data: any[] }, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const { data } = body;

      if (!Array.isArray(data)) {
        throw new Error("Expected 'data' to be an array.");
      }

      // Pass the extracted array to the service method along with the transaction
      await this.menuService.updateMenuResequence(data, 0, 0, trx);

      // If everything goes well, commit the transaction
      await trx.commit();
      return { message: 'Menu sequence updated successfully' };
    } catch (error) {
      // Rollback the transaction in case of error
      await trx.rollback();
      console.error('Error updating menu sequence in controller:', error);
      throw new InternalServerErrorException('Failed to update menu sequence');
    }
  }

  @UseGuards(AuthGuard)
  @Put('update/:id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMenuSchema)) data: UpdateMenuDto,
    @Req() req,
  ) {
    const trx = await dbMssql.transaction();
    try {
      data.modifiedby = req.user?.user?.username || 'unknown';

      const result = await this.menuService.update(+id, data, trx);

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error updating menu in controller:', error);
      throw new Error('Failed to update menu');
    }
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req) {
    const trx = await dbMssql.transaction();
    try {
      const result = await this.menuService.delete(
        +id,
        trx,
        req.user?.user?.username,
      );

      if (result.status === 404) {
        throw new NotFoundException(result.message);
      }

      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      console.error('Error deleting menu in controller:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to delete menu');
    }
  }
}
