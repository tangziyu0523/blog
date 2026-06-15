import { createHash } from 'node:crypto';

/**
 * Stable per-viewer dedup key. Logged-in viewers key on their userId;
 * anonymous viewers key on a hash of ip+ua. Prefixes (`u:` / `a:`)
 * keep the two namespaces from ever colliding.
 */
export function viewerKeyFor(
  userId: string | undefined,
  ip: string | undefined,
  ua: string | undefined,
): string {
  if (userId) return `u:${userId}`;
  const hash = createHash('sha256')
    .update(`${ip ?? ''}|${ua ?? ''}`)
    .digest('hex');
  return `a:${hash}`;
}
