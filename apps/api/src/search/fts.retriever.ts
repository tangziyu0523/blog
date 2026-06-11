import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Retriever, RankedHit } from './retriever';
import { tokenize } from './tokenizer';

interface IdRank {
  id: string;
  rank: number;
}

@Injectable()
export class FtsRetriever implements Retriever {
  readonly name = 'fts';
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(query: string, limit: number): Promise<RankedHit[]> {
    const tokenized = tokenize(query);
    const hits = new Map<string, number>();

    if (tokenized.length > 0) {
      const ftsRows = await this.prisma.$queryRaw<IdRank[]>(Prisma.sql`
        SELECT "id",
               ts_rank_cd(search_vector, plainto_tsquery('simple', ${tokenized})) AS rank
        FROM "Post"
        WHERE "status" = 'PUBLISHED'
          AND search_vector @@ plainto_tsquery('simple', ${tokenized})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
      for (const r of ftsRows) hits.set(r.id, Number(r.rank));
    }

    // Trigram fallback on the raw query when the FTS pool is thin.
    if (hits.size < limit) {
      const trgmRows = await this.prisma.$queryRaw<IdRank[]>(Prisma.sql`
        SELECT "id", similarity("title", ${query}) AS rank
        FROM "Post"
        WHERE "status" = 'PUBLISHED'
          AND "title" % ${query}
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
      // FTS hits always outrank trgm-only hits: give fallback a negative base.
      for (const r of trgmRows) {
        if (!hits.has(r.id)) hits.set(r.id, Number(r.rank) - 1);
      }
    }

    return [...hits.entries()]
      .map(([postId, score]): RankedHit => ({ postId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
