import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';
import { StorageService } from '../src/storage/storage.service';

describe('Avatar upload (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
    jest.restoreAllMocks();
  });

  const creds = {
    email: 'av@test.com',
    password: 'password123',
    nickname: 'Av',
  };

  it('presign -> confirm writes avatarUrl as a relative key (not a URL)', async () => {
    const storage = app.get(StorageService);
    jest.spyOn(storage, 'presign').mockResolvedValue({
      url: 'http://minio/put',
      key: 'avatars/uid/img.webp',
    });
    jest
      .spyOn(storage, 'confirm')
      .mockImplementation(async (_uid: string, key: string) => key);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    const presign = await agent.post('/me/avatar/presign').expect(201);
    expect(presign.body.url).toBeTruthy();
    const confirm = await agent
      .post('/me/avatar/confirm')
      .send({ key: 'avatars/uid/img.webp' })
      .expect(201);
    expect(confirm.body.avatarUrl).toBe('avatars/uid/img.webp');
    expect(confirm.body.avatarUrl).not.toMatch(/^https?:\/\//);
  });

  it('confirm with a key owned by someone else -> 400 INVALID_UPLOAD', async () => {
    // real StorageService.confirm: the ownership-prefix check rejects before any S3 call
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    const res = await agent
      .post('/me/avatar/confirm')
      .send({ key: 'avatars/someoneelse/x.webp' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');
  });
});
