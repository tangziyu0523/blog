"use client";

import { startTransition, useState } from "react";
import type { Paginated, PostSummary } from "@blog/shared";
import { PostCard } from "@/components/PostCard";
import { HeadlinePost } from "@/components/HeadlinePost";
import { ScrollReveal } from "@/components/ScrollReveal";
import { fetchPosts } from "@/lib/posts";
import {
  Butterfly2,
  Foliage2,
  Bird1,
  Flower2,
  Butterfly4,
  Foliage3,
} from "@/components/illustrations";

const LIST_PLATES = [Butterfly2, Foliage2, Bird1, Flower2, Butterfly4, Foliage3];

type Tab = "latest" | "hot";
const TAB = "font-sans text-[10px] uppercase tracking-[0.25em]";

export function PostList({ initial }: { initial: Paginated<PostSummary> }) {
  const [tab, setTab] = useState<Tab>("latest");
  // 缓存两个 tab 的结果，避免重复请求；latest 用服务端首屏数据。
  const [cache, setCache] = useState<Record<Tab, PostSummary[] | null>>({
    latest: initial.items,
    hot: null,
  });
  const [loading, setLoading] = useState(false);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    if (cache[next]) return;
    setLoading(true);
    fetchPosts(next)
      .then((res) =>
        startTransition(() => setCache((c) => ({ ...c, [next]: res.items }))),
      )
      .catch(() => undefined)
      .finally(() => startTransition(() => setLoading(false)));
  }

  const items = cache[tab] ?? [];
  const [headline, ...rest] = items;

  return (
    <>
      <div
        className="mt-12 flex items-center gap-4 border-b pb-3"
        style={{ borderColor: "var(--border)" }}
      >
        {(["latest", "hot"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={TAB}
            style={{ color: tab === t ? "var(--text)" : "var(--text-3)" }}
            aria-pressed={tab === t}
          >
            {t === "latest" ? "最新" : "最热"}
          </button>
        ))}
        {loading && (
          <span className={TAB} style={{ color: "var(--text-3)" }}>
            …
          </span>
        )}
      </div>

      {items.length === 0 && !loading && (
        <p className="mt-16" style={{ color: "var(--text-3)" }}>
          还没有发布的文章。
        </p>
      )}

      {headline && <HeadlinePost post={headline} />}

      {rest.length > 0 && (
        <ScrollReveal key={`${tab}-${items.length}`}>
          <section className="mt-16">
            {rest.map((post, i) => {
              const withPlate = i % 2 === 0;
              const Plate = withPlate
                ? LIST_PLATES[Math.floor(i / 2) % LIST_PLATES.length]
                : undefined;
              return (
                <PostCard key={post.id} post={post} index={i + 2} illustration={Plate} />
              );
            })}
          </section>
        </ScrollReveal>
      )}
    </>
  );
}
