const WINDOW = 60; // chars around the first match
const MAX = 160; // cap snippet length

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build a search snippet with the first matching token wrapped in <b>.
 * Source is HTML-escaped first, so the only markup in the result is <b>/</b>.
 */
export function buildHighlight(body: string, queryTokens: string[]): string {
  if (!body) return '';
  const lower = body.toLowerCase();
  let hitToken = '';
  let hitIdx = -1;
  for (const tok of queryTokens) {
    if (!tok) continue;
    const idx = lower.indexOf(tok.toLowerCase());
    if (idx !== -1 && (hitIdx === -1 || idx < hitIdx)) {
      hitIdx = idx;
      hitToken = tok;
    }
  }
  if (hitIdx === -1) {
    return escapeHtml(body.slice(0, MAX));
  }
  const start = Math.max(0, hitIdx - WINDOW);
  const end = Math.min(body.length, hitIdx + hitToken.length + WINDOW);
  const before = escapeHtml(body.slice(start, hitIdx));
  const match = escapeHtml(body.slice(hitIdx, hitIdx + hitToken.length));
  const after = escapeHtml(body.slice(hitIdx + hitToken.length, end));
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return `${prefix}${before}<b>${match}</b>${after}${suffix}`;
}
