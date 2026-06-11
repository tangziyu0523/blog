import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LikeResult } from '@blog/shared';

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent like toggle, race-safe and transaction-safe.
   *
   * Uses createMany({ skipDuplicates }) / deleteMany so a duplicate or missing
   * row is reported via a count rather than a thrown constraint error — a thrown
   * error inside a Postgres transaction aborts it, which would break any
   * follow-up statement. The unique constraint on Like(userId, postId) still
   * enforces dedup; likeCount is changed by exactly the number of rows this
   * transaction inserted/deleted, so it never drifts from the real like count.
   */
  async toggle(userId: string, postId: string): Promise<LikeResult> {
    return this.prisma.$transaction(async (tx): Promise<LikeResult> => {
      const inserted = await tx.like.createMany({
        data: [{ userId, postId }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) {
        const post = await tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
        return { liked: true, likeCount: post.likeCount };
      }

      // Row already existed → this toggle is an UNLIKE.
      const removed = await tx.like.deleteMany({ where: { userId, postId } });
      if (removed.count === 0) {
        // A concurrent unlike already removed it; don't double-decrement.
        const post = await tx.post.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: post.likeCount };
      }
      const post = await tx.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: post.likeCount };
    });
  }
}
