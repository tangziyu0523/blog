import Link from "next/link";
import type { PostSummary } from "@blog/shared";
import { Bird1 } from "@/components/illustrations";

export function PostCard({ post }: { post: PostSummary }) {
  return (
    <article
      className="relative rounded-lg border bg-[var(--surface)] p-6"
      style={{ borderColor: "var(--border)" }}
    >
      <Bird1 width={64} height={51} className="absolute right-4 top-4 opacity-80" />
      <Link href={`/posts/${post.slug}`}>
        <h2 className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
          {post.title}
        </h2>
      </Link>
      <p
        className="mt-1 italic"
        style={{ color: "var(--text-2)", fontFamily: "var(--font-body)" }}
      >
        {(post.tags[0] ?? "未分类")} · {post.likeCount} likes
      </p>
      {post.summary && (
        <p className="mt-3" style={{ color: "var(--text-2)" }}>
          {post.summary}
        </p>
      )}
    </article>
  );
}
