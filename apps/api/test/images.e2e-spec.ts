import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';
import { StorageService } from '../src/storage/storage.service';

describe('Image upload (e2e)', () => {
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
    email: 'img@test.com',
    password: 'password123',
    nickname: 'Img',
  };

  it('presign -> confirm returns the stored key', async () => {
    const storage = app.get(StorageService);
    jest.spyOn(storage, 'presignImage').mockResolvedValue({
      url: 'http://minio/put',
      key: 'images/uid/img.webp',
    });
    jest
      .spyOn(storage, 'confirmImage')
      .mockImplementation(async (_uid: string, key: string) => key);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    const presign = await agent.post('/me/images/presign').expect(201);
    expect(presign.body.url).toBeTruthy();
    expect(presign.body.key).toBe('images/uid/img.webp');
    const confirm = await agent
      .post('/me/images/confirm')
      .send({ key: 'images/uid/img.webp' })
      .expect(201);
    expect(confirm.body.key).toBe('images/uid/img.webp');
  });

  it('presign without auth -> 401', async () => {
    await request(app.getHttpServer()).post('/me/images/presign').expect(401);
  });

  it('confirm with a key owned by someone else -> 400 INVALID_UPLOAD', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    const res = await agent
      .post('/me/images/confirm')
      .send({ key: 'images/someoneelse/x.webp' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');
  });

  it('confirm with a malformed key -> 400 (DTO validation)', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    await agent
      .post('/me/images/confirm')
      .send({ key: 'not-a-key' })
      .expect(400);
  });
});
