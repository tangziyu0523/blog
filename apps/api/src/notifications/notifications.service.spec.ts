import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { FollowsService } from './follows.service';
import { NotificationStreamService } from './notification-stream.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  notification: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  post: { findUnique: jest.fn() },
  comment: { findUnique: jest.fn() },
};
const streamMock = { push: jest.fn() };
const followsMock = { listFollowerIds: jest.fn() };

function notifRow(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    userId: 'recipient',
    type: 'POST_COMMENT',
    actorId: 'actor',
    postId: 'p1',
    commentId: 'c1',
    readAt: null,
    createdAt: new Date('2026-06-12T00:00:00Z'),
    actor: { id: 'actor', nickname: 'A', avatarUrl: null },
    post: { slug: 's', title: 't' },
    comment: { id: 'c1' },
    ...over,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const ref = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FollowsService, useValue: followsMock },
        { provide: NotificationStreamService, useValue: streamMock },
      ],
    }).compile();
    service = ref.get(NotificationsService);
  });

  it('emit creates a row and pushes the view to the recipient', async () => {
    prismaMock.notification.create.mockResolvedValue(notifRow());
    const view = await service.emit('recipient', 'POST_COMMENT', {
      actorId: 'actor',
      postId: 'p1',
      commentId: 'c1',
    });
    expect(view.id).toBe('n1');
    expect(view.category).toBe('interaction');
    expect(streamMock.push).toHaveBeenCalledWith('recipient', view);
  });

  it('top-level comment notifies the post author', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ authorId: 'postAuthor' });
    prismaMock.notification.create.mockResolvedValue(
      notifRow({ userId: 'postAuthor' }),
    );
    await service.notifyForNewComment({
      id: 'c1',
      postId: 'p1',
      authorId: 'commenter',
      parentId: null,
      quotedId: null,
    });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'postAuthor',
          type: 'POST_COMMENT',
        }),
      }),
    );
  });

  it('does not notify when commenting on your own post', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ authorId: 'me' });
    await service.notifyForNewComment({
      id: 'c1',
      postId: 'p1',
      authorId: 'me',
      parentId: null,
      quotedId: null,
    });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('reply notifies the replied-to comment author (quoted target), not the post author', async () => {
    prismaMock.comment.findUnique.mockResolvedValue({ authorId: 'replied' });
    prismaMock.notification.create.mockResolvedValue(
      notifRow({ userId: 'replied', type: 'COMMENT_REPLY' }),
    );
    await service.notifyForNewComment({
      id: 'c2',
      postId: 'p1',
      authorId: 'replier',
      parentId: 'top1',
      quotedId: 'r1',
    });
    expect(prismaMock.comment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' } }),
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'replied',
          type: 'COMMENT_REPLY',
        }),
      }),
    );
    expect(prismaMock.post.findUnique).not.toHaveBeenCalled();
  });

  it('notifyNewPost fans out to all followers', async () => {
    followsMock.listFollowerIds.mockResolvedValue(['f1', 'f2']);
    prismaMock.notification.create.mockResolvedValue(
      notifRow({ type: 'NEW_POST' }),
    );
    await service.notifyNewPost({ id: 'p1', authorId: 'author' });
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
  });

  it('notification failure is swallowed (does not throw)', async () => {
    prismaMock.post.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      service.notifyForNewComment({
        id: 'c1',
        postId: 'p1',
        authorId: 'x',
        parentId: null,
        quotedId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('markRead rejects marking another user notification', async () => {
    prismaMock.notification.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'owner',
      readAt: null,
    });
    await expect(service.markRead('intruder', 'n1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
