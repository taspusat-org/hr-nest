import { PartialType } from '@nestjs/mapped-types';
import { CreateApprovaldetailDto } from './create-approvaldetail.dto';

export class UpdateApprovaldetailDto extends PartialType(
  CreateApprovaldetailDto,
) {}
