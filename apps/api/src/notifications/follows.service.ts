import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { FollowResult } from '@blog/shared';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(followerId: string, authorId: string): Promise<FollowResult> {
    if (followerId === authorId) {
      throw new AppError(
        ErrorCode.CANNOT_FOLLOW_SELF,
        400,
        'Cannot follow yourself',
      );
    }
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!author)
      throw new AppError(ErrorCode.USER_NOT_FOUND, 404, 'User not found');

    return this.prisma.$transaction(async (tx): Promise<FollowResult> => {
      const inserted = await tx.follow.createMany({
        data: [{ followerId, authorId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        await tx.follow.deleteMany({ where: { followerId, authorId } });
      }
      const followerCount = await tx.follow.count({ where: { authorId } });
      return { following: inserted.count === 1, followerCount };
    });
  }

  async status(
    viewerId: string | undefined,
    authorId: string,
  ): Promise<FollowResult> {
    const followerCount = await this.prisma.follow.count({
      where: { authorId },
    });
    if (!viewerId) return { following: false, followerCount };
    const row = await this.prisma.follow.findUnique({
      where: { followerId_authorId: { followerId: viewerId, authorId } },
    });
    return { following: row !== null, followerCount };
  }

  async listFollowerIds(authorId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { authorId },
      select: { followerId: true },
    });
    return rows.map((r) => r.followerId);
  }
}
