import { Test, TestingModule } from '@nestjs/testing';
import { KaryawanMutasiService } from './karyawan_mutasi.service';

describe('KaryawanMutasiService', () => {
  let service: KaryawanMutasiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KaryawanMutasiService],
    }).compile();

    service = module.get<KaryawanMutasiService>(KaryawanMutasiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
