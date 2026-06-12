import { Test } from '@nestjs/testing';
import { FollowsService } from './follows.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = {
  follow: { createMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
};
const prismaMock = {
  $transaction: jest.fn(),
  user: { findUnique: jest.fn() },
  follow: { count: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
};

describe('FollowsService', () => {
  let service: FollowsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = ref.get(FollowsService);
  });

  it('follows when not yet following', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'a' });
    tx.follow.createMany.mockResolvedValue({ count: 1 });
    tx.follow.count.mockResolvedValue(1);
    const r = await service.toggle('u1', 'a');
    expect(r).toEqual({ following: true, followerCount: 1 });
  });

  it('unfollows when already following', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'a' });
    tx.follow.createMany.mockResolvedValue({ count: 0 });
    tx.follow.deleteMany.mockResolvedValue({ count: 1 });
    tx.follow.count.mockResolvedValue(0);
    const r = await service.toggle('u1', 'a');
    expect(r).toEqual({ following: false, followerCount: 0 });
  });

  it('rejects self-follow', async () => {
    await expect(service.toggle('u1', 'u1')).rejects.toMatchObject({
      code: 'CANNOT_FOLLOW_SELF',
    });
  });

  it('rejects following a missing author', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.toggle('u1', 'ghost')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('listFollowerIds returns author follower ids', async () => {
    prismaMock.follow.findMany.mockResolvedValue([
      { followerId: 'x' },
      { followerId: 'y' },
    ]);
    expect(await service.listFollowerIds('a')).toEqual(['x', 'y']);
  });
});
