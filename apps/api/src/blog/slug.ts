import { randomUUID } from 'node:crypto';

/** ASCII-slugify a title; non-ASCII titles fall back to a random slug. */
export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || `post-${randomUUID().slice(0, 8)}`;
}

export function shortSuffix(): string {
  return randomUUID().slice(0, 4);
}
