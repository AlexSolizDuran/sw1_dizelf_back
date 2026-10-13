import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe conectar en onModuleInit', async () => {
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockImplementation(async () => {});

    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalled();
  });

  it('debe desconectar limpiamente en onModuleDestroy', async () => {
    const disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockImplementation(async () => {});

    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
