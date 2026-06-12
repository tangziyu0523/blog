import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { CommentView } from '@blog/shared';
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
}
