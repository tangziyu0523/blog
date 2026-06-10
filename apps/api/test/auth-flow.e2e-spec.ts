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
        (c) => c.startsWith('refresh_token=') && c.includes('Path=/auth'),
      ),
    ).toBe(true);
  });

  it('register -> /me -> refresh -> logout; old refresh dead after logout', async () => {
    const agent = request.agent(app.getHttpServer());

    // register — stores access_token (Path=/) and refresh_token (Path=/auth) in jar
    await agent.post('/auth/register').send(creds).expect(201);

    // /me uses access_token (Path=/) — agent sends it automatically
    await agent.get('/me').expect(200);

    // rotate tokens; refresh_token (Path=/auth) is sent to /auth/refresh
    await agent.post('/auth/refresh').expect(200);

    // logout — refresh_token (Path=/auth) is sent to /auth/logout by a real
    // cookie jar, exactly as a browser would; the session is then revoked
    await agent.post('/auth/logout').expect(204);

    // After logout the (rotated) refresh token must be dead
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
