import request from 'supertest';
import nock from 'nock';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';
import { RedisService } from '../src/redis/redis.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GitHub OAuth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    nock.disableNetConnect();
    nock.enableNetConnect(
      (host) => host.includes('127.0.0.1') || host.includes('localhost'),
    );
  });

  afterAll(async () => {
    await app.close();
    nock.enableNetConnect();
    nock.cleanAll();
  });

  beforeEach(async () => {
    await resetDb(app);
    nock.cleanAll();
  });

  function stubGithub(login: string, githubId: string, email: string): void {
    nock('https://github.com')
      .post('/login/oauth/access_token')
      .reply(200, { access_token: 'gho_test', token_type: 'bearer' });
    nock('https://api.github.com')
      .get('/user')
      .query(true)
      .reply(200, { id: githubId, login });
    nock('https://api.github.com')
      .get('/user/emails')
      .query(true)
      .reply(200, [{ email, primary: true, verified: true }]);
  }

  async function seedState(): Promise<string> {
    const redis = app.get(RedisService);
    const state = 'teststate';
    await redis.set(`oauth_state:${state}`, '/', 'EX', 600);
    return state;
  }

  it('branch 1: existing githubId -> login (302 to web root) with cookies', async () => {
    const prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: 'gh@test.com',
        nickname: 'gh',
        githubId: '12345',
        githubLogin: 'octo',
      },
    });
    stubGithub('octo', '12345', 'gh@test.com');
    const state = await seedState();
    const res = await request(app.getHttpServer())
      .get(`/auth/github/callback?code=abc&state=${state}`)
      .expect(302);
    expect(res.headers.location).toBe('http://localhost:3000/');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
  });

  it('branch 2: new githubId + free email -> create + login', async () => {
    stubGithub('newbie', '999', 'new@test.com');
    const state = await seedState();
    await request(app.getHttpServer())
      .get(`/auth/github/callback?code=abc&state=${state}`)
      .expect(302);
    const prisma = app.get(PrismaService);
    const created = await prisma.user.findUnique({
      where: { githubId: '999' },
    });
    expect(created?.email).toBe('new@test.com');
  });

  it('branch 3: email already taken by non-github account -> redirect EMAIL_TAKEN_BIND_REQUIRED', async () => {
    const prisma = app.get(PrismaService);
    await prisma.user.create({
      data: { email: 'taken@test.com', nickname: 'pw', passwordHash: 'HASH' },
    });
    stubGithub('intruder', '777', 'taken@test.com');
    const state = await seedState();
    const res = await request(app.getHttpServer())
      .get(`/auth/github/callback?code=abc&state=${state}`)
      .expect(302);
    expect(res.headers.location).toContain('error=EMAIL_TAKEN_BIND_REQUIRED');
  });
});
