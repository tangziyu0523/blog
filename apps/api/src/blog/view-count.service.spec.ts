import { Test } from '@nestjs/testing';
import { ViewCountService } from './view-count.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const redisMock = { set: jest.fn() };
const prismaMock = { post: { updateMany: jest.fn() } };

describe('ViewCountService', () => {
  let service: ViewCountService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ViewCountService,
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(ViewCountService);
  });

  it('counts a new viewer (NX wins) and increments a published post', async () => {
    redisMock.set.mockResolvedValue('OK');
    prismaMock.post.updateMany.mockResolvedValue({ count: 1 });

    await service.record('post-1', 'a:hash');

    expect(redisMock.set).toHaveBeenCalledWith(
      'view:post-1:a:hash',
      '1',
      'EX',
      43200,
      'NX',
    );
    expect(prismaMock.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post-1', status: 'PUBLISHED' },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('does not increment when the viewer is within the dedup window', async () => {
    redisMock.set.mockResolvedValue(null); // NX lost

    await service.record('post-1', 'a:hash');

    expect(prismaMock.post.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op for drafts / missing posts (updateMany count 0, no throw)', async () => {
    redisMock.set.mockResolvedValue('OK');
    prismaMock.post.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.record('draft-1', 'a:hash')).resolves.toBeUndefined();
  });

  it('fails open when redis throws (no increment, no throw)', async () => {
    redisMock.set.mockRejectedValue(new Error('redis down'));

    await expect(service.record('post-1', 'a:hash')).resolves.toBeUndefined();
    expect(prismaMock.post.updateMany).not.toHaveBeenCalled();
  });
});
