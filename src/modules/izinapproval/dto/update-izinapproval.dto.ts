import { PartialType } from '@nestjs/mapped-types';
import { CreateIzinapprovalDto } from './create-izinapproval.dto';

export class UpdateIzinapprovalDto extends PartialType(CreateIzinapprovalDto) {}
