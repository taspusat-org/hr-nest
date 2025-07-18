import { Test, TestingModule } from '@nestjs/testing';
import { AcosService } from './acos.service';

describe('AcosService', () => {
  let service: AcosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AcosService],
    }).compile();

    service = module.get<AcosService>(AcosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
