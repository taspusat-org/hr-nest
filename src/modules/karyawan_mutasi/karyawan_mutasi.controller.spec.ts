import { Test, TestingModule } from '@nestjs/testing';
import { KaryawanMutasiController } from './karyawan_mutasi.controller';
import { KaryawanMutasiService } from './karyawan_mutasi.service';

describe('KaryawanMutasiController', () => {
  let controller: KaryawanMutasiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KaryawanMutasiController],
      providers: [KaryawanMutasiService],
    }).compile();

    controller = module.get<KaryawanMutasiController>(KaryawanMutasiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
