import type { Paginated, PostSummary } from "@blog/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function searchPosts(
  q: string,
  page = 1,
  pageSize = 10,
): Promise<Paginated<PostSummary>> {
  const params = new URLSearchParams({
    q,
    page: String(page),
    pageSize: String(pageSize),
  });
  const res = await fetch(`${BASE}/search?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json() as Promise<Paginated<PostSummary>>;
}
