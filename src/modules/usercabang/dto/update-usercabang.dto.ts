import { PartialType } from '@nestjs/mapped-types';
import { CreateUsercabangDto } from './create-usercabang.dto';

export class UpdateUsercabangDto extends PartialType(CreateUsercabangDto) {}
