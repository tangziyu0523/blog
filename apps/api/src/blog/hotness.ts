import { Prisma } from '@prisma/client';

// 热度权重与重力（集中定义；改这里即改公式）。
export const W_LIKE = 10;
export const W_COMMENT = 4;
export const W_VIEW = 1;
export const GRAVITY = 1.5;

/**
 * HN 式重力衰减打分的 ORDER BY 表达式（DESC 由调用方加）。
 * score = (10*likeCount + 4*commentCount + 1*viewCount)
 *         / power(ageDays + 2, 1.5)
 * 权重以参数注入，绝不拼接用户输入。
 */
export function hotScoreSql(): Prisma.Sql {
  return Prisma.sql`(
    ${W_LIKE} * "likeCount" + ${W_COMMENT} * "commentCount" + ${W_VIEW} * "viewCount"
  ) / power(EXTRACT(EPOCH FROM (now() - "publishedAt")) / 86400 + 2, ${GRAVITY})`;
}
