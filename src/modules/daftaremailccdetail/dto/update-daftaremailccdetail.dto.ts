import { PartialType } from '@nestjs/mapped-types';
import { CreateDaftaremailccdetailDto } from './create-daftaremailccdetail.dto';

export class UpdateDaftaremailccdetailDto extends PartialType(
  CreateDaftaremailccdetailDto,
) {}
