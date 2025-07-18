import { Test, TestingModule } from '@nestjs/testing';
import { RunningNumberController } from './running-number.controller';
import { RunningNumberService } from './running-number.service';

describe('RunningNumberController', () => {
  let controller: RunningNumberController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunningNumberController],
      providers: [RunningNumberService],
    }).compile();

    controller = module.get<RunningNumberController>(RunningNumberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
