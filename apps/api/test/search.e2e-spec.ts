import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

describe('Search (e2e)', () => {
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

  async function authorAgent() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .send({ email: 'a@test.com', password: 'password123', nickname: 'A' })
      .expect(201);
    return agent;
  }

  async function publish(
    agent: ReturnType<typeof request.agent>,
    body: { title: string; contentMd: string; tags?: string[] },
  ) {
    const created = await agent.post('/posts').send(body).expect(201);
    await agent
      .patch(`/posts/${created.body.id}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return created.body.slug as string;
  }

  it('finds a published post by a Chinese keyword and highlights it', async () => {
    const a = await authorAgent();
    await publish(a, {
      title: '数据库性能优化指南',
      contentMd: '本文讲解索引与缓存如何提升查询性能。',
    });

    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: '性能优化' })
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].title).toBe('数据库性能优化指南');
    expect(res.body.items[0].highlight).toContain('<b>');
  });

  it('ranks a title match above a body-only match', async () => {
    const a = await authorAgent();
    await publish(a, { title: '缓存策略详解', contentMd: '无关内容' });
    await publish(a, {
      title: '其他主题',
      contentMd: '顺带提到缓存这个词一次',
    });

    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: '缓存' })
      .expect(200);

    expect(res.body.items[0].title).toBe('缓存策略详解');
  });

  it('does NOT match unpublished drafts', async () => {
    const a = await authorAgent();
    await a
      .post('/posts')
      .send({ title: '草稿机密关键词', contentMd: 'x' })
      .expect(201); // left as DRAFT

    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: '机密' })
      .expect(200);
    expect(res.body.total).toBe(0);
  });

  it('falls back to trigram for a typo in the title', async () => {
    const a = await authorAgent();
    await publish(a, { title: 'PostgreSQL 全文检索', contentMd: '正文' });

    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'PostgreSQ' }) // truncated / typo
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects an empty q with 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: '' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('paginates results', async () => {
    const a = await authorAgent();
    for (let i = 0; i < 3; i++) {
      await publish(a, { title: `缓存文章 ${i}`, contentMd: '缓存内容' });
    }
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: '缓存', page: 1, pageSize: 2 })
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it('meets the P95 ≤ 300ms latency budget on a small corpus', async () => {
    const a = await authorAgent();
    for (let i = 0; i < 30; i++) {
      await publish(a, {
        title: `性能与缓存 ${i}`,
        contentMd: '数据库索引、缓存策略、查询性能优化的讨论。'.repeat(20),
      });
    }
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = Date.now();
      await request(app.getHttpServer())
        .get('/search')
        .query({ q: '性能优化', pageSize: 10 })
        .expect(200);
      samples.push(Date.now() - t);
    }
    samples.sort((x, y) => x - y);
    const p95 = samples[Math.floor(samples.length * 0.95) - 1];
    expect(p95).toBeLessThanOrEqual(300);
  });
});
