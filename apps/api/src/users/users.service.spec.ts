import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorCode } from '@blog/shared';

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('findByEmail delegates to prisma', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
    const u = await service.findByEmail('a@b.com');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
    });
    expect(u).toEqual({ id: 'u1' });
  });

  it('bindGithub rejects when githubId already taken by another user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'other',
      githubId: 'gh1',
    });
    await expect(
      service.bindGithub('u1', 'gh1', 'octocat'),
    ).rejects.toMatchObject({
      code: ErrorCode.GITHUB_ALREADY_BOUND,
    });
  });

  it('bindGithub writes when githubId is free', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({ id: 'u1', githubId: 'gh1' });
    await service.bindGithub('u1', 'gh1', 'octocat');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { githubId: 'gh1', githubLogin: 'octocat' },
    });
  });

  it('unbindGithub rejects pure-github account (no password)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: null,
    });
    await expect(service.unbindGithub('u1')).rejects.toMatchObject({
      code: ErrorCode.CANNOT_UNBIND_LAST_METHOD,
    });
  });

  it('unbindGithub clears github fields for password account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: 'h',
    });
    prismaMock.user.update.mockResolvedValue({ id: 'u1', githubId: null });
    await service.unbindGithub('u1');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { githubId: null, githubLogin: null },
    });
  });
});
