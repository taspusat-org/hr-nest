import { PartialType } from '@nestjs/mapped-types';
import { CreateCutidetailDto } from './create-cutidetail.dto';

export class UpdateCutidetailDto extends PartialType(CreateCutidetailDto) {}
