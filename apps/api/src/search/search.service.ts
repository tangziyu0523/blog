import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FtsRetriever } from './fts.retriever';
import type { Retriever, RankedHit } from './retriever';
import { toSummary, type PostWithAuthor } from '../blog/post.mapper';
import { tokenize, stripMarkdown } from './tokenizer';
import { buildHighlight } from './highlight';
import type { Paginated, PostSummary } from '@blog/shared';

const CANDIDATE_POOL = 100;

@Injectable()
export class SearchService {
  private readonly retrievers: Retriever[];
  constructor(
    private readonly prisma: PrismaService,
    fts: FtsRetriever,
  ) {
    this.retrievers = [fts];
  }

  /** Single retriever today => pass-through. Future: RRF over multiple lists. */
  private fuse(lists: RankedHit[][]): RankedHit[] {
    return lists[0] ?? [];
  }

  async search(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<PostSummary>> {
    const lists = await Promise.all(
      this.retrievers.map((r) => r.retrieve(q, CANDIDATE_POOL)),
    );
    const fused = this.fuse(lists);
    const total = fused.length;

    const pageHits = fused.slice((page - 1) * pageSize, page * pageSize);
    const ids = pageHits.map((h) => h.postId);
    if (ids.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const rows = (await this.prisma.post.findMany({
      where: { id: { in: ids } },
      include: { author: true },
    })) as PostWithAuthor[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    const queryTokens = tokenize(q).split(' ').filter(Boolean);
    const items: PostSummary[] = pageHits
      .map((h) => byId.get(h.postId))
      .filter((r): r is PostWithAuthor => r !== undefined)
      .map((r) => ({
        ...toSummary(r),
        highlight: buildHighlight(stripMarkdown(r.contentMd), queryTokens),
      }));

    return { items, total, page, pageSize };
  }
}
