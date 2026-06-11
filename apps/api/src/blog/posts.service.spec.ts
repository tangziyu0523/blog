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
