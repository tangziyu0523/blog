import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const VIEW_DEDUP_TTL_SECONDS = 43200; // 12h

@Injectable()
export class ViewCountService {
  private readonly logger = new Logger(ViewCountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Record one view for a post, deduped per viewer within a 12h window.
   *
   * Redis is best-effort: if the dedup check throws (Redis down) we skip
   * counting and return rather than fail the request (fail-open). The DB
   * increment, by contrast, is NOT swallowed — a Prisma error propagates to
   * the caller. Drafts / missing posts are a no-op because updateMany matches
   * zero rows.
   */
  async record(postId: string, viewerKey: string): Promise<void> {
    let isNew = false;
    try {
      const res = await this.redis.set(
        `view:${postId}:${viewerKey}`,
        '1',
        'EX',
        VIEW_DEDUP_TTL_SECONDS,
        'NX',
      );
      isNew = res === 'OK';
    } catch (err) {
      this.logger.warn(
        'view dedup skipped (redis unavailable)',
        err instanceof Error ? err.stack : String(err),
      );
      return; // fail-open
    }
    if (!isNew) return;
    await this.prisma.post.updateMany({
      where: { id: postId, status: 'PUBLISHED' },
      data: { viewCount: { increment: 1 } },
    });
  }
}
