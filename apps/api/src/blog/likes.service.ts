import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LikeResult } from '@blog/shared';

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent like toggle. Unique constraint dedups; atomic inc/dec avoids lost updates. */
  async toggle(userId: string, postId: string): Promise<LikeResult> {
    return this.prisma.$transaction(async (tx): Promise<LikeResult> => {
      try {
        await tx.like.create({ data: { userId, postId } });
        const post = await tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
        return { liked: true, likeCount: post.likeCount };
      } catch (err) {
        // P2002 = unique-constraint violation = already liked → this call is an UNLIKE.
        // Intentional catch (not a swallowed error): the constraint IS the dedup signal.
        if ((err as { code?: string }).code === 'P2002') {
          await tx.like.delete({
            where: { userId_postId: { userId, postId } },
          });
          const post = await tx.post.update({
            where: { id: postId },
            data: { likeCount: { decrement: 1 } },
            select: { likeCount: true },
          });
          return { liked: false, likeCount: post.likeCount };
        }
        throw err;
      }
    });
  }
}
