import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

describe('Lockout (e2e)', () => {
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
    email: 'lock@test.com',
    password: 'password123',
    nickname: 'L',
  };

  it('6th wrong login returns 423 ACCOUNT_LOCKED with Retry-After', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: creds.email, password: 'wrong' })
        .expect(401);
    }
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: creds.email, password: 'wrong' })
      .expect(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    expect(res.headers['retry-after']).toBeDefined();
  });
});
