import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

describe('Blog core (e2e)', () => {
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

  const author = { email: 'author@test.com', password: 'password123', nickname: 'Author' };
  const reader = { email: 'reader@test.com', password: 'password123', nickname: 'Reader' };

  async function newAgent(creds: typeof author) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    return agent;
  }

  it('create draft -> hidden from public list -> publish -> visible -> detail by slug', async () => {
    const a = await newAgent(author);

    const created = await a
      .post('/posts')
      .send({ title: 'My First Post', contentMd: '# Hello', tags: ['ts'] })
      .expect(201);
    expect(created.body.status).toBe('DRAFT');
    const { id, slug } = created.body;

    const anon = request.agent(app.getHttpServer());
    const empty = await anon.get('/posts').expect(200);
    expect(empty.body.total).toBe(0);

    await a.patch(`/posts/${id}`).send({ status: 'PUBLISHED' }).expect(200);

    const list = await anon.get('/posts').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].slug).toBe(slug);

    const detail = await anon.get(`/posts/${slug}`).expect(200);
    expect(detail.body.contentMd).toBe('# Hello');
    expect(detail.body.viewerLiked).toBe(false);
  });

  it('like toggle: like -> count 1 -> unlike -> count 0', async () => {
    const a = await newAgent(author);
    const created = await a
      .post('/posts')
      .send({ title: 'Likeable', contentMd: 'x' })
      .expect(201);
    const id = created.body.id;
    await a.patch(`/posts/${id}`).send({ status: 'PUBLISHED' }).expect(200);

    const r = await newAgent(reader);
    const liked = await r.post(`/posts/${id}/like`).expect(200);
    expect(liked.body).toEqual({ liked: true, likeCount: 1 });

    const unliked = await r.post(`/posts/${id}/like`).expect(200);
    expect(unliked.body).toEqual({ liked: false, likeCount: 0 });
  });

  it('non-owner cannot PATCH or DELETE (403)', async () => {
    const a = await newAgent(author);
    const created = await a.post('/posts').send({ title: 'Mine', contentMd: 'x' }).expect(201);
    const id = created.body.id;

    const intruder = await newAgent(reader);
    await intruder.patch(`/posts/${id}`).send({ title: 'hacked' }).expect(403);
    await intruder.delete(`/posts/${id}`).expect(403);
  });

  it('anonymous like is rejected (401)', async () => {
    const a = await newAgent(author);
    const created = await a.post('/posts').send({ title: 'P', contentMd: 'x' }).expect(201);
    await a.patch(`/posts/${created.body.id}`).send({ status: 'PUBLISHED' }).expect(200);

    const anon = request.agent(app.getHttpServer());
    await anon.post(`/posts/${created.body.id}/like`).expect(401);
  });

  it('liking a missing post returns 404', async () => {
    const r = await newAgent(reader);
    await r.post('/posts/nonexistent/like').expect(404);
  });
});
