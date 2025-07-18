import { PartialType } from '@nestjs/mapped-types';
import { CreateShiftDetailDto } from './create-shift_detail.dto';

export class UpdateShiftDetailDto extends PartialType(CreateShiftDetailDto) {}
