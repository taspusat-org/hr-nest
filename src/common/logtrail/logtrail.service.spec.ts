import { Test, TestingModule } from '@nestjs/testing';
import { LogtrailService } from './logtrail.service';

describe('LogtrailService', () => {
  let service: LogtrailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LogtrailService],
    }).compile();

    service = module.get<LogtrailService>(LogtrailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
