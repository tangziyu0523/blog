import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import { RedisService } from '../redis/redis.service';
import { ErrorCode } from '@blog/shared';

describe('TokenService', () => {
  let service: TokenService;
  const store = new Map<string, string>();
  const redisMock = {
    set: jest.fn(async (k: string, v: string) => { store.set(k, v); return 'OK'; }),
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    del: jest.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) { if (store.delete(k)) count++; }
      return count;
    }),
    keys: jest.fn(async (pat: string) => {
      const prefix = pat.replace('*', '');
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    }),
  };
  const configMock = {
    getOrThrow: (k: string) =>
      ({ JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) } as Record<string, string>)[k],
  };

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        TokenService,
        { provide: RedisService, useValue: redisMock as unknown as RedisService },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('issuePair stores a refresh entry', async () => {
    const pair = await service.issuePair('u1');
    expect(pair.accessToken).toBeTruthy();
    expect(store.has(`refresh:u1:${pair.refreshTokenId}`)).toBe(true);
  });

  it('rotate succeeds for a valid current refresh token and deletes old tid', async () => {
    const pair = await service.issuePair('u1');
    const next = await service.rotate('u1', pair.refreshTokenId, pair.refreshToken);
    expect(store.has(`refresh:u1:${pair.refreshTokenId}`)).toBe(false);
    expect(store.has(`refresh:u1:${next.refreshTokenId}`)).toBe(true);
  });

  it('rotate on an already-rotated (missing) tid throws REFRESH_REUSE_DETECTED and wipes all', async () => {
    const pair = await service.issuePair('u1');
    await service.issuePair('u1');
    await service.rotate('u1', pair.refreshTokenId, pair.refreshToken);
    await expect(service.rotate('u1', pair.refreshTokenId, pair.refreshToken)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_REUSE_DETECTED,
    });
    const remaining = await redisMock.keys('refresh:u1:*');
    expect(remaining).toHaveLength(0);
  });

  it('verifyRefresh throws for an invalid token', async () => {
    await expect(service.verifyRefresh('not-a-jwt')).rejects.toBeDefined();
  });
});
