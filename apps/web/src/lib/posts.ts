import type { Paginated, PostSummary, PostDetail } from "@blog/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchPublishedPosts(): Promise<Paginated<PostSummary>> {
  const res = await fetch(`${BASE}/posts`, { cache: "no-store" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json() as Promise<Paginated<PostSummary>>;
}

export async function fetchPostBySlug(slug: string): Promise<PostDetail | null> {
  const res = await fetch(`${BASE}/posts/${slug}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  return res.json() as Promise<PostDetail>;
}
