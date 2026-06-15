import Link from "next/link";
import type { ComponentType } from "react";
import type { PostSummary } from "@blog/shared";
import type { IllustrationProps } from "@/components/illustrations";

const TINY = "font-sans text-[10px] uppercase tracking-[0.25em]";
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * A demoted index row. Italic running number on the left, the article body in
 * the middle, an optional mid-size plate on the right. Rows are separated by a
 * hairline rule instead of being boxed in cards.
 *
 * `index` and `illustration` are optional so consumers like the search page can
 * still render a bare row with `<PostCard post={post} />`.
 */
export function PostCard({
  post,
  index,
  illustration: Illo,
}: {
  post: PostSummary;
  index?: number;
  illustration?: ComponentType<IllustrationProps>;
}) {
  const meta = (
    <div className={TINY} style={{ color: "var(--text-2)" }}>
      {(post.tags[0] ?? "Field Notes")} · {fmtDate(post.publishedAt)} ·{" "}
      {post.likeCount} likes · {post.viewCount} views
    </div>
  );

  const body = (
    <div className={Illo ? "flex items-start justify-between gap-6 md:gap-10" : ""}>
      <div className="min-w-0 flex-1">
        {meta}
        <Link href={`/posts/${post.slug}`}>
          <h3
            className="mt-2"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(22px, 2.8vw, 30px)",
              lineHeight: 1.08,
            }}
          >
            {post.title}
          </h3>
        </Link>
        {post.summary && (
          <p
            className="mt-2 line-clamp-2 max-w-2xl"
            style={{ color: "var(--text-2)", fontFamily: "var(--font-body)" }}
          >
            {post.summary}
          </p>
        )}
      </div>

      {Illo && (
        <div className="hidden shrink-0 sm:block">
          <Illo width={190} className="h-auto w-[150px] md:w-[190px]" />
        </div>
      )}
    </div>
  );

  return (
    <article
      className="grid grid-cols-[2.75rem_1fr] gap-x-5 border-t py-7 sm:grid-cols-[4.5rem_1fr] md:gap-x-8"
      style={{ borderColor: "var(--border)" }}
    >
      {index !== undefined ? (
        <div
          className="italic leading-none"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-3)",
            fontSize: "clamp(20px, 2.4vw, 30px)",
          }}
        >
          Nº {String(index).padStart(2, "0")}
        </div>
      ) : (
        <div aria-hidden />
      )}
      {body}
    </article>
  );
}
