import { Test, TestingModule } from '@nestjs/testing';
import { RunningNumberService } from './running-number.service';

describe('RunningNumberService', () => {
  let service: RunningNumberService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RunningNumberService],
    }).compile();

    service = module.get<RunningNumberService>(RunningNumberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
