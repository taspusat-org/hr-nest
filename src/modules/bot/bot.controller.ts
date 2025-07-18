import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { BotService } from './bot.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}
  @Get('groups')
  async getGroups() {
    try {
      // Mengambil daftar grup dari WhatsApp
      const groups = await this.botService.getGroups();
      return { success: true, data: groups }; // Mengembalikan daftar grup dalam bentuk JSON
    } catch (error) {
      console.error('Error fetching groups:', error);
      return { success: false, message: 'Error fetching groups' };
    }
  }
  @Post('send-message')
  async sendMessage(): Promise<string> {
    await this.botService.sendMessageToNumbers();
    return `Pesan berhasil dikirim ke nomor`;
  }
  @Post('send-bulk-message')
  async sendBulkMessage(
    @Body() body: { numbers: string[]; message: string; count: number },
  ): Promise<string> {
    const { numbers, message, count } = body;
    await this.botService.sendBulkMessages(numbers, message, count);
    return `${count} pesan berhasil dikirim ke ${numbers.length} nomor`;
  }
  @Post('send')
  async send(@Body() dto: any): Promise<{ success: boolean }> {
    await this.botService.sendWhatsappMessage2(dto.numbers, dto.namakaryawan);
    return { success: true };
  }
}
