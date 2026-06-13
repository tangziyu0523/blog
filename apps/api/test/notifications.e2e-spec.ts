import http from 'node:http';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

type Agent = ReturnType<typeof request.agent>;

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

async function newAgent(
  app: INestApplication,
  creds: typeof author,
): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/register').send(creds).expect(201);
  return agent;
}

async function userId(agent: Agent): Promise<string> {
  const me = await agent.get('/me').expect(200);
  return me.body.id as string;
}

async function publishedPost(agent: Agent): Promise<string> {
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

describe('Subscriptions & notifications (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ disableThrottle: true });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('follow toggles and rejects self-follow', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);

    const f1 = await r.post(`/users/${aId}/follow`).expect(200);
    expect(f1.body).toEqual({ following: true, followerCount: 1 });
    const f2 = await r.post(`/users/${aId}/follow`).expect(200);
    expect(f2.body).toEqual({ following: false, followerCount: 0 });

    await a.post(`/users/${aId}/follow`).expect(400);
  });

  it('followed author publishing notifies the follower (NEW_POST)', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);
    await r.post(`/users/${aId}/follow`).expect(200);

    await publishedPost(a);

    const list = await r.get('/notifications').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].type).toBe('NEW_POST');
    const unread = await r.get('/notifications/unread-count').expect(200);
    expect(unread.body.count).toBe(1);
  });

  it('commenting on a post notifies the post author; replying notifies the comment author', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const postId = await publishedPost(a);

    const top = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'nice' })
      .expect(201);
    const authorNotifs = await a.get('/notifications').expect(200);
    expect(authorNotifs.body.items[0].type).toBe('POST_COMMENT');

    await a
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'thanks', parentId: top.body.id })
      .expect(201);
    const readerNotifs = await r.get('/notifications').expect(200);
    expect(readerNotifs.body.items[0].type).toBe('COMMENT_REPLY');
  });

  it('does not notify yourself for your own comment', async () => {
    const a = await newAgent(app, author);
    const postId = await publishedPost(a);
    await a
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'self' })
      .expect(201);
    const list = await a.get('/notifications').expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('mark read (single + all); cannot mark another user notification', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);
    await r.post(`/users/${aId}/follow`).expect(200);
    await publishedPost(a);

    const list = await r.get('/notifications').expect(200);
    const nId = list.body.items[0].id as string;

    await a.post(`/notifications/${nId}/read`).expect(403);
    await r.post(`/notifications/${nId}/read`).expect(204);
    const unread = await r.get('/notifications/unread-count').expect(200);
    expect(unread.body.count).toBe(0);

    await r.post('/notifications/read-all').expect(204);
  });
});

describe('Notifications SSE (e2e)', () => {
  let app: INestApplication;
  let port: number;
  beforeAll(async () => {
    app = await createTestApp({ disableThrottle: true });
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('streams a NEW_POST notification to a connected follower', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);
    await r.post(`/users/${aId}/follow`).expect(200);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: reader.email, password: reader.password })
      .expect(200);
    const cookies = (login.headers['set-cookie'] as unknown as string[]) ?? [];
    const accessCookie = cookies
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('access_token='));
    expect(accessCookie).toBeDefined();

    const received = new Promise<string>((resolve, reject) => {
      const req = http.get(
        {
          host: '127.0.0.1',
          port,
          path: '/notifications/stream',
          headers: { Cookie: accessCookie as string },
        },
        (res) => {
          res.setEncoding('utf8');
          let buf = '';
          res.on('data', (chunk: string) => {
            buf += chunk;
            if (buf.includes('NEW_POST')) {
              req.destroy();
              resolve(buf);
            }
          });
        },
      );
      req.on('error', (e) => {
        if (!String(e).includes('ECONNRESET')) reject(e);
      });
      setTimeout(() => {
        req.destroy();
        reject(new Error('SSE timeout: no event received'));
      }, 4000);
    });

    await new Promise((res) => setTimeout(res, 200));
    await publishedPost(a);

    const payload = await received;
    expect(payload).toContain('NEW_POST');
  });
});
