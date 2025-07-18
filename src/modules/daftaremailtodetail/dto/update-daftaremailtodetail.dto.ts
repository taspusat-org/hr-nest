import { PartialType } from '@nestjs/mapped-types';
import { CreateDaftaremailtodetailDto } from './create-daftaremailtodetail.dto';

export class UpdateDaftaremailtodetailDto extends PartialType(
  CreateDaftaremailtodetailDto,
) {}
