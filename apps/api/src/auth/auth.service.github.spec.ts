import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RedisService } from '../redis/redis.service';

describe('AuthService.handleGithubLogin', () => {
  let service: AuthService;
  const users = {
    findByGithubId: jest.fn(),
    findByEmail: jest.fn(),
    createGithubUser: jest.fn(),
    toAuthUser: jest.fn((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      bio: null,
      avatarUrl: null,
      githubLogin: u.githubLogin,
    })),
  };
  const tokens = {
    issuePair: jest.fn(async () => ({
      accessToken: 'a',
      refreshToken: 'r',
      refreshTokenId: 't',
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PasswordService, useValue: {} },
        { provide: TokenService, useValue: tokens },
        { provide: RedisService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  const profile = { githubId: 'gh1', githubLogin: 'octocat', email: 'a@b.com' };

  it('logs in when githubId already bound', async () => {
    users.findByGithubId.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      nickname: 'A',
      githubLogin: 'octocat',
    });
    const out = await service.handleGithubLogin(profile);
    expect(out.kind).toBe('login');
    expect(users.createGithubUser).not.toHaveBeenCalled();
  });

  it('creates + logs in when githubId unbound and email free', async () => {
    users.findByGithubId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);
    users.createGithubUser.mockResolvedValue({
      id: 'u2',
      email: 'a@b.com',
      nickname: 'octocat',
      githubLogin: 'octocat',
    });
    const out = await service.handleGithubLogin(profile);
    expect(out.kind).toBe('login');
    expect(users.createGithubUser).toHaveBeenCalled();
  });

  it('returns bind_required when email already taken by non-github account', async () => {
    users.findByGithubId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue({ id: 'u3', email: 'a@b.com' });
    const out = await service.handleGithubLogin(profile);
    expect(out.kind).toBe('bind_required');
  });
});
