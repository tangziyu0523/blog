import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { LikeResult } from '@blog/shared';

@Injectable()
export class CommentLikesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 幂等点赞切换；事务内以 createMany/deleteMany 的 count 驱动计数增减，不漂移。 */
  async toggle(userId: string, commentId: string): Promise<LikeResult> {
    return this.prisma.$transaction(async (tx): Promise<LikeResult> => {
      const exists = await tx.comment.findUnique({
        where: { id: commentId },
        select: { id: true, status: true },
      });
      if (!exists || exists.status === 'DELETED') {
        throw new AppError(
          ErrorCode.COMMENT_NOT_FOUND,
          404,
          'Comment not found',
        );
      }
      const inserted = await tx.commentLike.createMany({
        data: [{ userId, commentId }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) {
        const c = await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
        return { liked: true, likeCount: c.likeCount };
      }

      // Row already existed → this toggle is an UNLIKE.
      const removed = await tx.commentLike.deleteMany({
        where: { userId, commentId },
      });
      if (removed.count === 0) {
        // A concurrent unlike already removed it; don't double-decrement.
        const c = await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: c.likeCount };
      }
      const c = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: c.likeCount };
    });
  }
}
