import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

const author = {
  email: 'author@test.com',
  password: 'password123',
  nickname: 'Author',
};
const reader = {
  email: 'reader@test.com',
  password: 'password123',
  nickname: 'Reader',
};

async function newAgent(app: INestApplication, creds: typeof author) {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/register').send(creds).expect(201);
  return agent;
}

type Agent = ReturnType<typeof request.agent>;

async function publishedPost(agent: Agent) {
  const created = await agent
    .post('/posts')
    .send({ title: 'Topic', contentMd: '# Hi', tags: ['t'] })
    .expect(201);
  await agent
    .patch(`/posts/${created.body.id}`)
    .send({ status: 'PUBLISHED' })
    .expect(200);
  return created.body.id as string;
}

describe('Comments (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    // Throttling off: functional assertions must not be affected by the
    // shared per-IP rate-limit window.
    app = await createTestApp({ disableThrottle: true });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('create top-level, reply, and reply-to-reply re-parents + quotes', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const postId = await publishedPost(a);

    const top = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'top' })
      .expect(201);
    const reply = await a
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'reply', parentId: top.body.id })
      .expect(201);
    const deep = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'deep', parentId: reply.body.id })
      .expect(201);
    expect(deep.body.quoted.id).toBe(reply.body.id);

    const list = await request
      .agent(app.getHttpServer())
      .get(`/posts/${postId}/comments`)
      .expect(200);
    expect(list.body.commentCount).toBe(3);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].replyCount).toBe(2);
    expect(list.body.items[0].replies).toHaveLength(2);
  });

  it('requires auth to create', async () => {
    const a = await newAgent(app, author);
    const postId = await publishedPost(a);
    await request
      .agent(app.getHttpServer())
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'x' })
      .expect(401);
  });

  it('rejects empty and over-long content', async () => {
    const a = await newAgent(app, author);
    const postId = await publishedPost(a);
    await a
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: '' })
      .expect(400);
    await a
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'x'.repeat(2001) })
      .expect(400);
  });

  it('like toggles count idempotently', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const postId = await publishedPost(a);
    const c = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'c' })
      .expect(201);

    const liked = await a.post(`/comments/${c.body.id}/like`).expect(200);
    expect(liked.body).toEqual({ liked: true, likeCount: 1 });
    const unliked = await a.post(`/comments/${c.body.id}/like`).expect(200);
    expect(unliked.body).toEqual({ liked: false, likeCount: 0 });
  });

  it('edit by author sets edited; non-author forbidden', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const postId = await publishedPost(a);
    const c = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'orig' })
      .expect(201);

    const edited = await r
      .patch(`/comments/${c.body.id}`)
      .send({ contentMd: 'new' })
      .expect(200);
    expect(edited.body.editedAt).not.toBeNull();
    expect(edited.body.contentMd).toBe('new');
    await a
      .patch(`/comments/${c.body.id}`)
      .send({ contentMd: 'hack' })
      .expect(403);
  });

  it('post author can delete any comment -> tombstone, count drops', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const postId = await publishedPost(a);
    const c = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'c' })
      .expect(201);

    await a.delete(`/comments/${c.body.id}`).expect(204);
    const list = await request
      .agent(app.getHttpServer())
      .get(`/posts/${postId}/comments`)
      .expect(200);
    expect(list.body.commentCount).toBe(0);
    expect(list.body.items[0].status).toBe('DELETED');
    expect(list.body.items[0].contentMd).toBe('');
  });

  it('unrelated reader cannot delete', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const stranger = await newAgent(app, {
      email: 's@test.com',
      password: 'password123',
      nickname: 'S',
    });
    const postId = await publishedPost(a);
    const c = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'c' })
      .expect(201);
    await stranger.delete(`/comments/${c.body.id}`).expect(403);
  });
});

describe('Comments throttling (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    // Dedicated app with throttling ON and its own fresh in-memory window,
    // isolated from the functional suite above.
    app = await createTestApp();
    await resetDb(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('throttles rapid comment creation (429)', async () => {
    const a = await newAgent(app, author);
    const postId = await publishedPost(a);
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await a
        .post(`/posts/${postId}/comments`)
        .send({ contentMd: `c${i}` });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
