import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CronjobSaldocutiService } from './cronjob-saldocuti.service';
import { CreateCronjobSaldocutiDto } from './dto/create-cronjob-saldocuti.dto';
import { UpdateCronjobSaldocutiDto } from './dto/update-cronjob-saldocuti.dto';

@Controller('cronjob-saldocuti')
export class CronjobSaldocutiController {
  constructor(
    private readonly cronjobSaldocutiService: CronjobSaldocutiService,
  ) {}
}
