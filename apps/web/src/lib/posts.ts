import type { Paginated, PostSummary, PostDetail } from "@blog/shared";
import { api } from "./api";

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

/** 我的文章（含草稿），按 updatedAt 倒序。需登录，走 cookie 认证，仅 client 调用。 */
export function fetchMyPosts(page = 1, pageSize = 10): Promise<Paginated<PostSummary>> {
  const qs = `?mine=1&page=${page}&pageSize=${pageSize}`;
  return api<Paginated<PostSummary>>(`/posts${qs}`);
}

/** 删除自己的文章（后端 204）。需登录。 */
export function deletePost(id: string): Promise<void> {
  return api<void>(`/posts/${id}`, { method: "DELETE" });
}

/** 已发布文章列表，支持 latest/hot 排序。公共读取，SSR 与 client 均可调用。 */
export async function fetchPosts(
  sort: "latest" | "hot" = "latest",
  page = 1,
  pageSize = 10,
): Promise<Paginated<PostSummary>> {
  const qs = `?sort=${sort}&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(`${BASE}/posts${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json() as Promise<Paginated<PostSummary>>;
}
