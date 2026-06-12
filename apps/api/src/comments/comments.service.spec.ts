import { Test } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = {
  post: { findUnique: jest.fn(), update: jest.fn() },
  comment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};
const prismaMock = { $transaction: jest.fn() };

function authorRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c-new',
    postId: 'p1',
    authorId: 'u1',
    parentId: null,
    quotedId: null,
    contentMd: 'hi',
    status: 'VISIBLE',
    likeCount: 0,
    editedAt: null,
    createdAt: new Date('2026-06-12T00:00:00Z'),
    author: { id: 'u1', nickname: 'N', avatarUrl: null },
    quoted: null,
    ...over,
  };
}

describe('CommentsService.create', () => {
  let service: CommentsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = ref.get(CommentsService);
  });

  it('creates top-level comment and increments commentCount', async () => {
    tx.post.findUnique.mockResolvedValue({ id: 'p1' });
    tx.comment.create.mockResolvedValue(authorRow());
    tx.post.update.mockResolvedValue({});
    const v = await service.create('u1', 'p1', { contentMd: 'hi' });
    expect(v.id).toBe('c-new');
    expect(v.replyCount).toBe(0);
    expect(tx.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postId: 'p1',
          authorId: 'u1',
          parentId: null,
          quotedId: null,
        }),
      }),
    );
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { commentCount: { increment: 1 } },
    });
  });

  it('replying to a reply re-parents to the top comment and quotes the target', async () => {
    tx.post.findUnique.mockResolvedValue({ id: 'p1' });
    tx.comment.findUnique
      .mockResolvedValueOnce({
        id: 'r1',
        postId: 'p1',
        parentId: 'top1',
        status: 'VISIBLE',
      })
      .mockResolvedValueOnce({ id: 'r1', postId: 'p1', status: 'VISIBLE' });
    tx.comment.create.mockResolvedValue(
      authorRow({ parentId: 'top1', quotedId: 'r1' }),
    );
    tx.post.update.mockResolvedValue({});
    await service.create('u1', 'p1', { contentMd: 'hi', parentId: 'r1' });
    expect(tx.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'top1', quotedId: 'r1' }),
      }),
    );
  });

  it('rejects when post does not exist', async () => {
    tx.post.findUnique.mockResolvedValue(null);
    await expect(
      service.create('u1', 'pX', { contentMd: 'hi' }),
    ).rejects.toMatchObject({ code: 'POST_NOT_FOUND' });
  });
});
