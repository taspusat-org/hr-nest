import { Test, TestingModule } from '@nestjs/testing';
import { LogtrailController } from './logtrail.controller';
import { LogtrailService } from './logtrail.service';

describe('LogtrailController', () => {
  let controller: LogtrailController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogtrailController],
      providers: [LogtrailService],
    }).compile();

    controller = module.get<LogtrailController>(LogtrailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
