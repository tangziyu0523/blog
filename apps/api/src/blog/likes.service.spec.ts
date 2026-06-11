import { Test } from '@nestjs/testing';
import { LikesService } from './likes.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = {
  like: { createMany: jest.fn(), deleteMany: jest.fn() },
  post: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
};
const prismaMock = { $transaction: jest.fn() };

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

  it('likes when not yet liked (insert + increment)', async () => {
    tx.like.createMany.mockResolvedValue({ count: 1 });
    tx.post.update.mockResolvedValue({ likeCount: 1 });
    const r = await service.toggle('u1', 'p1');
    expect(r).toEqual({ liked: true, likeCount: 1 });
    expect(tx.like.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', postId: 'p1' }],
      skipDuplicates: true,
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    expect(tx.like.deleteMany).not.toHaveBeenCalled();
  });

  it('unlikes when already liked (delete + decrement)', async () => {
    tx.like.createMany.mockResolvedValue({ count: 0 });
    tx.like.deleteMany.mockResolvedValue({ count: 1 });
    tx.post.update.mockResolvedValue({ likeCount: 0 });
    const r = await service.toggle('u1', 'p1');
    expect(r).toEqual({ liked: false, likeCount: 0 });
    expect(tx.like.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', postId: 'p1' },
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
  });

  it('no-op decrement when a concurrent unlike already removed the row', async () => {
    tx.like.createMany.mockResolvedValue({ count: 0 });
    tx.like.deleteMany.mockResolvedValue({ count: 0 });
    tx.post.findUniqueOrThrow.mockResolvedValue({ likeCount: 3 });
    const r = await service.toggle('u1', 'p1');
    expect(r).toEqual({ liked: false, likeCount: 3 });
    expect(tx.post.update).not.toHaveBeenCalled();
  });
});
