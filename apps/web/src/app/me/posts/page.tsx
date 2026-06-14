"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import type { PostSummary } from "@blog/shared";
import { fetchMyPosts, deletePost } from "@/lib/posts";
import { useRequireAuth } from "@/lib/use-require-auth";

const PAGE_SIZE = 10;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-CN");
}

function DeleteControl({ title, onDelete }: { title: string; onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`删除《${title}》`}
        onClick={() => setConfirming(true)}
        style={{ color: "var(--text-3)" }}
      >
        删除
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {failed && <span style={{ color: "var(--accent)" }}>删除失败</span>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await onDelete();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
        style={{ color: "var(--accent)" }}
      >
        {busy ? "删除中…" : failed ? "重试" : "确定"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setFailed(false);
        }}
        style={{ color: "var(--text-3)" }}
      >
        取消
      </button>
    </span>
  );
}

export default function MyPostsPage() {
  const { ready } = useRequireAuth();
  const [items, setItems] = useState<PostSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    fetchMyPosts(page, PAGE_SIZE)
      .then((res) => {
        if (!active) return;
        startTransition(() => {
          setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
          setTotal(res.total);
        });
      })
      .catch(() => active && startTransition(() => setError("加载失败")))
      .finally(() => active && startTransition(() => setLoading(false)));
    return () => {
      active = false;
    };
  }, [ready, page]);

  async function onDelete(id: string) {
    await deletePost(id);
    startTransition(() => {
      setItems((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    });
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>
        我的文章
      </h1>
      {total > 0 && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>
          共 {total} 篇
        </p>
      )}

      <hr className="my-8" style={{ borderColor: "var(--border)" }} />

      {error && <p style={{ color: "var(--accent)" }}>{error}</p>}

      {!error && items.length === 0 && !loading && (
        <p style={{ color: "var(--text-3)" }}>
          还没有文章。<Link href="/editor/new" style={{ color: "var(--accent)" }}>写一篇</Link>
        </p>
      )}

      <ul className="flex flex-col">
        {items.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline justify-between gap-4 border-b py-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-lg" style={{ fontFamily: "var(--font-display)" }}>
                {p.title}
              </div>
              <div
                className="mt-1 text-sm"
                style={{ fontFamily: "var(--font-body)", fontStyle: "italic", color: "var(--text-3)" }}
              >
                {p.status === "PUBLISHED" ? "已发布" : "草稿"}
                {p.publishedAt ? ` · ${fmtDate(p.publishedAt)}` : ""}
                {p.status === "PUBLISHED" ? ` · ${p.likeCount} 喜欢` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-sm">
              <Link href={`/editor/${p.slug}`} aria-label={`编辑《${p.title}》`} style={{ color: "var(--text-2)" }}>
                编辑
              </Link>
              {p.status === "PUBLISHED" && (
                <Link href={`/posts/${p.slug}`} aria-label={`查看《${p.title}》`} style={{ color: "var(--text-2)" }}>
                  查看
                </Link>
              )}
              <DeleteControl title={p.title} onDelete={() => onDelete(p.id)} />
            </div>
          </li>
        ))}
      </ul>

      {!error && items.length < total && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => setPage((n) => n + 1)}
            className="rounded-full border px-5 py-2 disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            {loading ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
    </main>
  );
}
