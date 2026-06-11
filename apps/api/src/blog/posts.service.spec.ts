import { Test } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { PrismaService } from '../prisma/prisma.service';

const author = { id: 'u1', nickname: 'Al', avatarUrl: null };
const prismaMock = {
  post: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  like: { findUnique: jest.fn() },
};

describe('PostsService.create', () => {
  let service: PostsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(PostsService);
  });

  it('creates a draft with a unique slug', async () => {
    prismaMock.post.findUnique.mockResolvedValue(null); // slug free
    prismaMock.post.create.mockResolvedValue({
      id: 'p1',
      slug: 'hello',
      title: 'Hello',
      summary: null,
      contentMd: '# h',
      tags: [],
      status: 'DRAFT',
      likeCount: 0,
      authorId: 'u1',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      author,
    });
    const out = await service.create('u1', {
      title: 'Hello',
      contentMd: '# h',
    });
    expect(out.slug).toBe('hello');
    expect(out.status).toBe('DRAFT');
    expect(prismaMock.post.create).toHaveBeenCalled();
  });

  it('appends a suffix when the slug is taken', async () => {
    prismaMock.post.findUnique
      .mockResolvedValueOnce({ id: 'existing' }) // first slug taken
      .mockResolvedValueOnce(null); // suffixed slug free
    prismaMock.post.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'p2',
        slug: data.slug,
        title: data.title,
        summary: null,
        contentMd: data.contentMd,
        tags: [],
        status: 'DRAFT',
        likeCount: 0,
        authorId: 'u1',
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author,
      }),
    );
    const out = await service.create('u1', {
      title: 'Hello',
      contentMd: '# h',
    });
    expect(out.slug).toMatch(/^hello-[0-9a-f]{4}$/);
  });
});

describe('PostsService read/update/delete', () => {
  let service: PostsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(PostsService);
  });

  const row = (over: Partial<any> = {}) => ({
    id: 'p1',
    slug: 's',
    title: 't',
    summary: null,
    contentMd: 'c',
    tags: [],
    status: 'PUBLISHED',
    likeCount: 0,
    authorId: 'u1',
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    author,
    ...over,
  });

  it('getBySlug hides another user draft as not-found', async () => {
    prismaMock.post.findUnique.mockResolvedValue(row({ status: 'DRAFT' }));
    await expect(service.getBySlug('s', 'someone-else')).rejects.toMatchObject({
      code: 'POST_NOT_FOUND',
    });
  });

  it('getBySlug returns viewerLiked=true when a like row exists', async () => {
    prismaMock.post.findUnique.mockResolvedValue(row());
    prismaMock.like.findUnique.mockResolvedValue({
      userId: 'u9',
      postId: 'p1',
    });
    const d = await service.getBySlug('s', 'u9');
    expect(d.viewerLiked).toBe(true);
  });

  it('update rejects non-owner with FORBIDDEN', async () => {
    prismaMock.post.findUnique.mockResolvedValue(row({ authorId: 'owner' }));
    await expect(
      service.update('p1', 'intruder', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('update to PUBLISHED stamps publishedAt when previously unset', async () => {
    prismaMock.post.findUnique.mockResolvedValue(
      row({ status: 'DRAFT', publishedAt: null }),
    );
    prismaMock.like.findUnique.mockResolvedValue(null);
    prismaMock.post.update.mockImplementation(({ data }: any) =>
      Promise.resolve(
        row({ status: data.status, publishedAt: data.publishedAt }),
      ),
    );
    await service.update('p1', 'u1', { status: 'PUBLISHED' });
    const call = prismaMock.post.update.mock.calls[0][0];
    expect(call.data.publishedAt).toBeInstanceOf(Date);
  });

  it('remove rejects non-owner with FORBIDDEN', async () => {
    prismaMock.post.findUnique.mockResolvedValue(row({ authorId: 'owner' }));
    await expect(service.remove('p1', 'intruder')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('ensureExists throws POST_NOT_FOUND when missing', async () => {
    prismaMock.post.findUnique.mockResolvedValue(null);
    await expect(service.ensureExists('nope')).rejects.toMatchObject({
      code: 'POST_NOT_FOUND',
    });
  });

  it('getBySlug lets the author view their own draft', async () => {
    prismaMock.post.findUnique.mockResolvedValue(row({ status: 'DRAFT' }));
    prismaMock.like.findUnique.mockResolvedValue(null);
    const d = await service.getBySlug('s', 'u1');
    expect(d.status).toBe('DRAFT');
    expect(d.viewerLiked).toBe(false);
  });
});
