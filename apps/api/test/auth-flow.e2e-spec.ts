import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

describe('Auth flow (e2e)', () => {
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
    email: 'flow@test.com',
    password: 'password123',
    nickname: 'Flow',
  };

  it('register sets httpOnly cookies and returns AuthUser', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    expect(res.body.email).toBe(creds.email);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(
      cookies.some(
        (c) => c.startsWith('access_token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (c) =>
          c.startsWith('refresh_token=') && c.includes('Path=/auth/refresh'),
      ),
    ).toBe(true);
  });

  it('register -> /me -> refresh -> logout; old refresh dead after logout', async () => {
    const server = app.getHttpServer();
    const agent = request.agent(server);

    // register — stores access_token (Path=/) and refresh_token (Path=/auth/refresh) in jar
    const regRes = await agent.post('/auth/register').send(creds).expect(201);

    // /me uses access_token (Path=/) — agent sends it automatically
    await agent.get('/me').expect(200);

    // rotate tokens; agent sends refresh_token to /auth/refresh (same path prefix)
    const refreshRes = await agent.post('/auth/refresh').expect(200);

    // The refresh_token cookie has Path=/auth/refresh so the agent's cookie jar
    // won't include it for /auth/logout.  Extract it explicitly from the latest
    // Set-Cookie header (refresh gives a new pair) and pass it by hand.
    const allSetCookies = [
      ...((regRes.headers['set-cookie'] as unknown as string[] | undefined) ??
        []),
      ...((refreshRes.headers['set-cookie'] as unknown as
        | string[]
        | undefined) ?? []),
    ];
    const refreshCookie = allSetCookies
      .filter((c) => c.startsWith('refresh_token='))
      .at(-1)
      ?.split(';')[0]; // e.g. "refresh_token=<jwt>"

    expect(refreshCookie).toBeDefined();
    await request(server)
      .post('/auth/logout')
      .set('Cookie', refreshCookie!)
      .expect(204);

    // After logout the refresh token must be revoked — agent still has old refresh_token
    await agent.post('/auth/refresh').expect(401);
  });

  it('duplicate register returns 409 EMAIL_TAKEN', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('login with wrong password returns 401 INVALID_CREDENTIALS', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: creds.email, password: 'wrong' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('validation failure returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bad', password: 'x', nickname: '' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
