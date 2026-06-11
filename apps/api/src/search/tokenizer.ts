import { cut } from 'nodejieba';

/** Strip Markdown syntax to plain text before tokenizing the body. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, ' $1 ') // images/links -> keep text
    .replace(/^#{1,6}\s+/gm, ' ') // heading markers
    .replace(/[*_>#~-]/g, ' ') // emphasis / quote / list / rule markers
    .replace(/\s+/g, ' ')
    .trim();
}

const TOKEN_RE = /[一-龥a-z0-9]+/i;

/** nodejieba segmentation -> lowercased, space-joined, punctuation dropped. */
export function tokenize(text: string): string {
  if (!text) return '';

  // Pre-tokenize by spaces, then for each token segment Chinese/English separately
  const segments: string[] = [];

  text.split(/\s+/).forEach((token) => {
    // Match consecutive CJK + consecutive English+digits as separate tokens
    const parts = token.match(/[一-龥]+|[a-z0-9]+/gi);
    if (parts) {
      parts.forEach((p) => {
        const trimmed = p.trim().toLowerCase();
        if (TOKEN_RE.test(trimmed)) {
          segments.push(trimmed);
        }
      });
    }
  });

  // For CJK-only segments, further tokenize with nodejieba
  const result: string[] = [];
  segments.forEach((seg) => {
    if (/[一-龥]/.test(seg)) {
      // Chinese text; use nodejieba
      const cutResult = cut(seg);
      cutResult.forEach((t) => {
        const trimmed = t.trim().toLowerCase();
        if (TOKEN_RE.test(trimmed)) {
          result.push(trimmed);
        }
      });
    } else {
      // English/numbers; use as-is
      result.push(seg);
    }
  });

  return result.join(' ');
}
