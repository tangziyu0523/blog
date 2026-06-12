import { Test } from '@nestjs/testing';
import { CommentLikesService } from './comment-likes.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = {
  comment: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  commentLike: { createMany: jest.fn(), deleteMany: jest.fn() },
};
const prismaMock = { $transaction: jest.fn() };

describe('CommentLikesService.toggle', () => {
  let service: CommentLikesService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [
        CommentLikesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = ref.get(CommentLikesService);
  });

  it('likes when not yet liked', async () => {
    tx.comment.findUnique.mockResolvedValue({ id: 'c1', status: 'VISIBLE' });
    tx.commentLike.createMany.mockResolvedValue({ count: 1 });
    tx.comment.update.mockResolvedValue({ likeCount: 1 });
    const r = await service.toggle('u1', 'c1');
    expect(r).toEqual({ liked: true, likeCount: 1 });
  });

  it('unlikes when already liked', async () => {
    tx.comment.findUnique.mockResolvedValue({ id: 'c1', status: 'VISIBLE' });
    tx.commentLike.createMany.mockResolvedValue({ count: 0 });
    tx.commentLike.deleteMany.mockResolvedValue({ count: 1 });
    tx.comment.update.mockResolvedValue({ likeCount: 0 });
    const r = await service.toggle('u1', 'c1');
    expect(r).toEqual({ liked: false, likeCount: 0 });
  });

  it('rejects liking a missing or deleted comment', async () => {
    tx.comment.findUnique.mockResolvedValue(null);
    await expect(service.toggle('u1', 'cX')).rejects.toMatchObject({
      code: 'COMMENT_NOT_FOUND',
    });
  });
});
