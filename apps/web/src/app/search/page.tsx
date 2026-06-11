"use client";

import { Suspense, startTransition, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Paginated, PostSummary } from "@blog/shared";
import { searchPosts } from "@/lib/search";
import { sanitizeHighlight } from "@/lib/sanitize-highlight";
import { PostCard } from "@/components/PostCard";
import { Foliage2 } from "@/components/illustrations";

function Result({ post }: { post: PostSummary }) {
  return (
    <div>
      <PostCard post={post} />
      {post.highlight && (
        <p
          className="mt-2 px-6 text-sm"
          style={{ color: "var(--text-3)" }}
          dangerouslySetInnerHTML={{
            __html: sanitizeHighlight(post.highlight),
          }}
        />
      )}
    </div>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Number(params.get("page") ?? "1");
  const [input, setInput] = useState(q);
  const [data, setData] = useState<Paginated<PostSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the text input when the URL query changes (e.g. browser back/forward).
  useEffect(() => {
    startTransition(() => setInput(q));
  }, [q]);

  useEffect(() => {
    if (!q.trim()) {
      startTransition(() => setData(null));
      return;
    }
    let cancelled = false;
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    searchPosts(q, page)
      .then((res) => {
        if (!cancelled) startTransition(() => setData(res));
      })
      .catch(() => {
        if (!cancelled) startTransition(() => setError("搜索出错了，请稍后再试。"));
      })
      .finally(() => {
        if (!cancelled) startTransition(() => setLoading(false));
      });
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = input.trim();
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>
        搜索
      </h1>
      <form onSubmit={submit} className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索文章…"
          className="flex-1 rounded-lg border px-4 py-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
        <button
          type="submit"
          className="rounded-lg border px-4 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          搜索
        </button>
      </form>

      <hr className="my-8" style={{ borderColor: "var(--border)" }} />

      {!q.trim() && (
        <p style={{ color: "var(--text-3)" }}>输入关键词，查找已发布的文章。</p>
      )}
      {loading && <p style={{ color: "var(--text-3)" }}>搜索中…</p>}
      {error && <p style={{ color: "var(--text-3)" }}>{error}</p>}

      {q.trim() && !loading && !error && data && data.total === 0 && (
        <div className="flex flex-col items-center gap-4 py-10">
          <Foliage2 width={96} height={96} className="opacity-70" />
          <p style={{ color: "var(--text-3)" }}>
            没有找到与&ldquo;{q}&rdquo;相关的文章。
          </p>
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <div className="flex flex-col gap-6">
            {data.items.map((p) => (
              <Result key={p.id} post={p} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-8 flex justify-between">
              <button
                disabled={page <= 1}
                onClick={() =>
                  router.push(`/search?q=${encodeURIComponent(q)}&page=${page - 1}`)
                }
                className="disabled:opacity-40"
              >
                ← 上一页
              </button>
              <span style={{ color: "var(--text-3)" }}>
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() =>
                  router.push(`/search?q=${encodeURIComponent(q)}&page=${page + 1}`)
                }
                className="disabled:opacity-40"
              >
                下一页 →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}
