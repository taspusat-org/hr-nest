import { PartialType } from '@nestjs/mapped-types';
import { CreateKaryawanBerkaDto } from './create-karyawan_berka.dto';

export class UpdateKaryawanBerkaDto extends PartialType(
  CreateKaryawanBerkaDto,
) {}
