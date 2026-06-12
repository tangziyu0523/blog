import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type {
  CommentView,
  CommentListResult,
  CommentRepliesResult,
} from '@blog/shared';
import { COMMENT_INCLUDE, toCommentView } from './comment.mapper';

interface CreateInput {
  contentMd: string;
  parentId?: string;
  quotedId?: string;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    postId: string,
    input: CreateInput,
  ): Promise<CommentView> {
    return this.prisma.$transaction(async (tx): Promise<CommentView> => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true },
      });
      if (!post)
        throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');

      let parentId: string | null = null;
      let quotedId: string | null = input.quotedId ?? null;

      if (input.parentId) {
        const parent = await tx.comment.findUnique({
          where: { id: input.parentId },
          select: { id: true, postId: true, parentId: true, status: true },
        });
        if (
          !parent ||
          parent.postId !== postId ||
          parent.status === 'DELETED'
        ) {
          throw new AppError(
            ErrorCode.COMMENT_NOT_FOUND,
            404,
            'Parent comment not found',
          );
        }
        if (parent.parentId === null) {
          parentId = parent.id;
        } else {
          parentId = parent.parentId;
          quotedId = quotedId ?? parent.id;
        }
      }

      if (quotedId) {
        const quoted = await tx.comment.findUnique({
          where: { id: quotedId },
          select: { id: true, postId: true, status: true },
        });
        if (
          !quoted ||
          quoted.postId !== postId ||
          quoted.status === 'DELETED'
        ) {
          throw new AppError(
            ErrorCode.COMMENT_NOT_FOUND,
            404,
            'Quoted comment not found',
          );
        }
      }

      const created = await tx.comment.create({
        data: {
          postId,
          authorId: userId,
          parentId,
          quotedId,
          contentMd: input.contentMd,
        },
        include: COMMENT_INCLUDE,
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });

      return toCommentView(created, false, 0, []);
    });
  }

  private async likedSet(
    viewerId: string | undefined,
    ids: string[],
  ): Promise<Set<string>> {
    if (!viewerId || ids.length === 0) return new Set();
    const rows = await this.prisma.commentLike.findMany({
      where: { userId: viewerId, commentId: { in: ids } },
      select: { commentId: true },
    });
    return new Set(rows.map((r) => r.commentId));
  }

  async list(
    postId: string,
    viewerId: string | undefined,
    cursor?: string,
    take = 20,
  ): Promise<CommentListResult> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { commentCount: true },
    });
    if (!post)
      throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');

    const rows = await this.prisma.comment.findMany({
      where: { postId, parentId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: COMMENT_INCLUDE,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const topIds = page.map((r) => r.id);

    const replyRows = topIds.length
      ? await this.prisma.comment.findMany({
          where: { parentId: { in: topIds } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: COMMENT_INCLUDE,
        })
      : [];

    const repliesByParent = new Map<string, typeof replyRows>();
    for (const r of replyRows) {
      const list = repliesByParent.get(r.parentId as string) ?? [];
      list.push(r);
      repliesByParent.set(r.parentId as string, list);
    }

    const allIds = [...topIds, ...replyRows.map((r) => r.id)];
    const liked = await this.likedSet(viewerId, allIds);

    const items = page.map((top) => {
      const all = repliesByParent.get(top.id) ?? [];
      const first3 = all
        .slice(0, 3)
        .map((r) => toCommentView(r, liked.has(r.id), 0, []));
      return toCommentView(top, liked.has(top.id), all.length, first3);
    });

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      commentCount: post.commentCount,
    };
  }

  async listReplies(
    commentId: string,
    viewerId: string | undefined,
    cursor?: string,
    take = 20,
  ): Promise<CommentRepliesResult> {
    const top = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, parentId: true },
    });
    if (!top || top.parentId !== null) {
      throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Comment not found');
    }

    const rows = await this.prisma.comment.findMany({
      where: { parentId: commentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: COMMENT_INCLUDE,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const liked = await this.likedSet(
      viewerId,
      page.map((r) => r.id),
    );
    const items = page.map((r) => toCommentView(r, liked.has(r.id), 0, []));

    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }
}
