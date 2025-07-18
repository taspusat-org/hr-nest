import { Injectable } from '@nestjs/common';
import { CreateLogabsensiDto } from './dto/create-logabsensi.dto';
import { UpdateLogabsensiDto } from './dto/update-logabsensi.dto';

@Injectable()
export class LogabsensiService {
  create(createLogabsensiDto: CreateLogabsensiDto) {
    return 'This action adds a new logabsensi';
  }

  findAll() {
    return `This action returns all logabsensi`;
  }

  findOne(id: number) {
    return `This action returns a #${id} logabsensi`;
  }

  update(id: number, updateLogabsensiDto: UpdateLogabsensiDto) {
    return `This action updates a #${id} logabsensi`;
  }

  remove(id: number) {
    return `This action removes a #${id} logabsensi`;
  }
}
