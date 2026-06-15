import type { Prisma } from '@prisma/client';
import type { PostSummary, PostDetail } from '@blog/shared';

export type PostWithAuthor = Prisma.PostGetPayload<{
  include: { author: true };
}>;

export function toSummary(p: PostWithAuthor): PostSummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    tags: p.tags,
    status: p.status,
    likeCount: p.likeCount,
    viewCount: p.viewCount,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    author: {
      id: p.author.id,
      nickname: p.author.nickname,
      avatarUrl: p.author.avatarUrl,
    },
  };
}

export function toDetail(p: PostWithAuthor, viewerLiked: boolean): PostDetail {
  return {
    ...toSummary(p),
    contentMd: p.contentMd,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    viewerLiked,
  };
}
