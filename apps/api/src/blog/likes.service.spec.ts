import { Test } from '@nestjs/testing';
import { LikesService } from './likes.service';
import { PrismaService } from '../prisma/prisma.service';

// tx mock the $transaction callback receives
const tx = {
  like: { create: jest.fn(), delete: jest.fn() },
  post: { update: jest.fn() },
};
const prismaMock = {
  $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
};

describe('LikesService.toggle', () => {
  let service: LikesService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const moduleRef = await Test.createTestingModule({
      providers: [
        LikesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(LikesService);
  });

  it('likes when no row exists (increment)', async () => {
    tx.like.create.mockResolvedValue({});
    tx.post.update.mockResolvedValue({ likeCount: 1 });
    const r = await service.toggle('u1', 'p1');
    expect(r).toEqual({ liked: true, likeCount: 1 });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
  });

  it('unlikes on unique-constraint conflict (decrement)', async () => {
    tx.like.create.mockRejectedValue({ code: 'P2002' });
    tx.like.delete.mockResolvedValue({});
    tx.post.update.mockResolvedValue({ likeCount: 0 });
    const r = await service.toggle('u1', 'p1');
    expect(r).toEqual({ liked: false, likeCount: 0 });
    expect(tx.like.delete).toHaveBeenCalledWith({
      where: { userId_postId: { userId: 'u1', postId: 'p1' } },
    });
  });

  it('rethrows non-P2002 errors', async () => {
    tx.like.create.mockRejectedValue({ code: 'P2003' });
    await expect(service.toggle('u1', 'p1')).rejects.toMatchObject({
      code: 'P2003',
    });
  });
});
