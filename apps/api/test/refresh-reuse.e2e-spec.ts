import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createTestApp, resetDb } from './setup';

describe('Refresh reuse (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  const creds = {
    email: 'reuse@test.com',
    password: 'password123',
    nickname: 'R',
  };

  function refreshCookie(setCookie: string[]): string {
    const c = setCookie.find((x) => x.startsWith('refresh_token='));
    if (!c) throw new Error('no refresh_token cookie in response');
    return c.split(';')[0];
  }

  it('scenario A: rotated (old) token -> 401 REFRESH_REUSE_DETECTED and all sessions revoked', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    const oldRefresh = refreshCookie(
      reg.headers['set-cookie'] as unknown as string[],
    );
    const rot = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', oldRefresh)
      .expect(200);
    const newRefresh = refreshCookie(
      rot.headers['set-cookie'] as unknown as string[],
    );
    const reuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', oldRefresh)
      .expect(401);
    expect(reuse.body.code).toBe('REFRESH_REUSE_DETECTED');
    // the new token is now also dead (all revoked)
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', newRefresh)
      .expect(401);
  });

  it('scenario B: logged-out token -> 401 REFRESH_REUSE_DETECTED', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    const refresh = refreshCookie(
      reg.headers['set-cookie'] as unknown as string[],
    );
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', refresh)
      .expect(204);
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refresh)
      .expect(401);
    expect(res.body.code).toBe('REFRESH_REUSE_DETECTED');
  });

  it('scenario C: expired token -> 401 TOKEN_EXPIRED, other sessions unaffected', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    const liveRefresh = refreshCookie(
      reg.headers['set-cookie'] as unknown as string[],
    );
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const expired = await jwt.signAsync(
      { sub: 'someuser', tid: 'sometid' },
      { secret: config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: -10 },
    );
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${expired}`)
      .expect(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    // the live session still works (not revoked by the expired-token attempt)
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', liveRefresh)
      .expect(200);
  });
});
