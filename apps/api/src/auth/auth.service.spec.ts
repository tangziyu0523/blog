import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RedisService } from '../redis/redis.service';
import { ErrorCode } from '@blog/shared';

describe('AuthService (email)', () => {
  let service: AuthService;
  const users = {
    findByEmail: jest.fn(),
    createPasswordUser: jest.fn(),
    toAuthUser: jest.fn((u) => ({ id: u.id, email: u.email, nickname: u.nickname, bio: null, avatarUrl: null, githubLogin: null })),
  };
  const password = { hash: jest.fn(async () => 'HASH'), verify: jest.fn() };
  const tokens = { issuePair: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r', refreshTokenId: 't' })) };
  const failStore = new Map<string, number>();
  const redis = {
    get: jest.fn(async (k: string) => { const n = failStore.get(k); return n === undefined ? null : String(n); }),
    incr: jest.fn(async (k: string) => { const n = (failStore.get(k) ?? 0) + 1; failStore.set(k, n); return n; }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 900),
    del: jest.fn(async (k: string) => { failStore.delete(k); return 1; }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    failStore.clear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PasswordService, useValue: password },
        { provide: TokenService, useValue: tokens },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('register throws EMAIL_TAKEN when email exists', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u1' });
    await expect(service.register({ email: 'a@b.com', password: 'pw', nickname: 'A' })).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
  });

  it('register creates user and issues tokens', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.createPasswordUser.mockResolvedValue({ id: 'u1', email: 'a@b.com', nickname: 'A' });
    const res = await service.register({ email: 'a@b.com', password: 'pw', nickname: 'A' });
    expect(password.hash).toHaveBeenCalledWith('pw');
    expect(res.tokens.accessToken).toBe('a');
    expect(res.user.id).toBe('u1');
  });

  it('login throws INVALID_CREDENTIALS on unknown email', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: 'x@y.com', password: 'pw' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('login throws INVALID_CREDENTIALS when password wrong', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u1', passwordHash: 'HASH' });
    password.verify.mockResolvedValue(false);
    await expect(service.login({ email: 'a@b.com', password: 'bad' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('login locks after 5 failures', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u1', passwordHash: 'HASH' });
    password.verify.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await expect(service.login({ email: 'a@b.com', password: 'bad' })).rejects.toBeDefined();
    }
    await expect(service.login({ email: 'a@b.com', password: 'bad' })).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_LOCKED,
    });
  });

  it('login succeeds, clears counter, issues tokens', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com', nickname: 'A', passwordHash: 'HASH' });
    password.verify.mockResolvedValue(true);
    const res = await service.login({ email: 'a@b.com', password: 'pw' });
    expect(redis.del).toHaveBeenCalledWith('login_fail:a@b.com');
    expect(res.tokens.refreshToken).toBe('r');
  });
});
