import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import { slugifyTitle, shortSuffix } from './slug';
import { buildPostTokens } from '../search/post-tokens';
import { toSummary, toDetail, type PostWithAuthor } from './post.mapper';
import type { PostDetail, PostSummary, Paginated } from '@blog/shared';
import { hotScoreSql } from './hotness';

interface CreateInput {
  title: string;
  contentMd: string;
  tags?: string[];
  summary?: string;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugifyTitle(title);
    let slug = base;
    let attempts = 0;
    while (await this.prisma.post.findUnique({ where: { slug } })) {
      if (++attempts > 5) {
        throw new AppError(
          ErrorCode.SLUG_TAKEN,
          500,
          'Could not generate a unique slug',
        );
      }
      slug = `${base}-${shortSuffix()}`;
    }
    return slug;
  }

  async create(authorId: string, input: CreateInput): Promise<PostDetail> {
    const slug = await this.uniqueSlug(input.title);
    const tokens = buildPostTokens({
      title: input.title,
      contentMd: input.contentMd,
      tags: input.tags ?? [],
    });
    const post = await this.prisma.post.create({
      data: {
        slug,
        title: input.title,
        contentMd: input.contentMd,
        tags: input.tags ?? [],
        summary: input.summary ?? null,
        authorId,
        ...tokens,
      },
      include: { author: true },
    });
    return toDetail(post, false);
  }

  async list(opts: {
    page: number;
    pageSize: number;
    mine: boolean;
    userId?: string;
    sort?: 'latest' | 'hot';
  }): Promise<Paginated<PostSummary>> {
    if (!opts.mine && opts.sort === 'hot') {
      return this.listHot(opts.page, opts.pageSize);
    }
    const where: Prisma.PostWhereInput =
      opts.mine && opts.userId
        ? { authorId: opts.userId }
        : { status: 'PUBLISHED' };
    const orderBy: Prisma.PostOrderByWithRelationInput = opts.mine
      ? { updatedAt: 'desc' }
      : { publishedAt: 'desc' };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy,
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { author: true },
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      items: (rows as PostWithAuthor[]).map(toSummary),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  /** 「最热」：Postgres 实时按重力衰减分排序，再按 id 顺序取回带 author 的行。 */
  private async listHot(
    page: number,
    pageSize: number,
  ): Promise<Paginated<PostSummary>> {
    const offset = (page - 1) * pageSize;
    const ranked = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "Post"
      WHERE "status" = 'PUBLISHED'
      ORDER BY ${hotScoreSql()} DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const ids = ranked.map((r) => r.id);
    const [rows, total] = await Promise.all([
      ids.length
        ? this.prisma.post.findMany({
            where: { id: { in: ids } },
            include: { author: true },
          })
        : Promise.resolve([] as PostWithAuthor[]),
      this.prisma.post.count({ where: { status: 'PUBLISHED' } }),
    ]);
    const byId = new Map((rows as PostWithAuthor[]).map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is PostWithAuthor => r !== undefined)
      .map(toSummary);
    return { items, total, page, pageSize };
  }

  async getBySlug(slug: string, viewerId?: string): Promise<PostDetail> {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      include: { author: true },
    });
    if (!post)
      throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');
    if (post.status === 'DRAFT' && post.authorId !== viewerId) {
      throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');
    }
    const viewerLiked = viewerId
      ? await this.viewerLiked(viewerId, post.id)
      : false;
    return toDetail(post, viewerLiked);
  }

  async update(
    id: string,
    userId: string,
    input: {
      title?: string;
      contentMd?: string;
      tags?: string[];
      summary?: string;
      status?: 'DRAFT' | 'PUBLISHED';
    },
  ): Promise<PostDetail> {
    const existing = await this.prisma.post.findUnique({ where: { id } });
    if (!existing)
      throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');
    if (existing.authorId !== userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not your post');
    }
    const data: Prisma.PostUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.contentMd !== undefined) data.contentMd = input.contentMd;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.summary !== undefined) data.summary = input.summary;
    if (
      input.title !== undefined ||
      input.contentMd !== undefined ||
      input.tags !== undefined
    ) {
      const tokens = buildPostTokens({
        title: input.title ?? existing.title,
        contentMd: input.contentMd ?? existing.contentMd,
        tags: input.tags ?? existing.tags,
      });
      data.titleTokens = tokens.titleTokens;
      data.bodyTokens = tokens.bodyTokens;
      data.tagsTokens = tokens.tagsTokens;
    }
    // publishedAt records the FIRST publish time and is immutable thereafter:
    // first publish stamps now; re-publishing after a DRAFT reversion keeps the
    // original date (existing.publishedAt). Reverting to DRAFT does NOT clear it —
    // the public list filters on status, not publishedAt, so visibility is unaffected.
    const isPublishing =
      input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
    if (isPublishing) {
      data.status = 'PUBLISHED';
      data.publishedAt = existing.publishedAt ?? new Date();
    } else if (input.status === 'DRAFT') {
      data.status = 'DRAFT';
    }
    const post = await this.prisma.post.update({
      where: { id },
      data,
      include: { author: true },
    });
    if (isPublishing) {
      await this.notifications.notifyNewPost({
        id: post.id,
        authorId: post.authorId,
      });
    }
    const viewerLiked = await this.viewerLiked(userId, id);
    return toDetail(post, viewerLiked);
  }

  async remove(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.post.findUnique({ where: { id } });
    if (!existing)
      throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');
    if (existing.authorId !== userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not your post');
    }
    await this.prisma.post.delete({ where: { id } });
  }

  private async viewerLiked(userId: string, postId: string): Promise<boolean> {
    const row = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    return !!row;
  }
}
