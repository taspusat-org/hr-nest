import { PartialType } from '@nestjs/mapped-types';
import { CreateCutiapprovalDto } from './create-cutiapproval.dto';

export class UpdateCutiapprovalDto extends PartialType(CreateCutiapprovalDto) {}
