import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type {
  CommentView,
  CommentListResult,
  CommentRepliesResult,
} from '@blog/shared';
import {
  COMMENT_INCLUDE,
  toCommentView,
  type CommentRow,
} from './comment.mapper';

interface CreateInput {
  contentMd: string;
  parentId?: string;
  quotedId?: string;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    userId: string,
    postId: string,
    input: CreateInput,
  ): Promise<CommentView> {
    const { view, created } = await this.prisma.$transaction(
      async (tx): Promise<{ view: CommentView; created: CommentRow }> => {
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

        return { view: toCommentView(created, false, 0, []), created };
      },
    );

    await this.notifications.notifyForNewComment({
      id: created.id,
      postId: created.postId,
      authorId: created.authorId,
      parentId: created.parentId,
      quotedId: created.quotedId,
    });
    return view;
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

  async update(
    userId: string,
    commentId: string,
    input: { contentMd: string },
  ): Promise<CommentView> {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, status: true },
    });
    if (!existing || existing.status === 'DELETED') {
      throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Comment not found');
    }
    if (existing.authorId !== userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not your comment');
    }
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { contentMd: input.contentMd, editedAt: new Date() },
      include: COMMENT_INCLUDE,
    });
    return toCommentView(updated, false, 0, []);
  }

  async remove(userId: string, commentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          authorId: true,
          status: true,
          postId: true,
          post: { select: { authorId: true } },
        },
      });
      if (!c)
        throw new AppError(
          ErrorCode.COMMENT_NOT_FOUND,
          404,
          'Comment not found',
        );
      if (c.status === 'DELETED') return; // idempotent: already a tombstone, no double decrement
      if (c.authorId !== userId && c.post.authorId !== userId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          403,
          'Not allowed to delete this comment',
        );
      }
      await tx.comment.update({
        where: { id: commentId },
        data: { status: 'DELETED', contentMd: '' },
      });
      await tx.post.update({
        where: { id: c.postId },
        data: { commentCount: { decrement: 1 } },
      });
    });
  }
}
