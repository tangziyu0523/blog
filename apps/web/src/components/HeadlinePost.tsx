import Link from "next/link";
import type { PostSummary } from "@blog/shared";
import { Flower1 } from "@/components/illustrations";

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
 * The lead article. Granted the full broadsheet treatment: oversized headline
 * and deck on the left, a large botanical plate on the right, split by a rule.
 */
export function HeadlinePost({ post }: { post: PostSummary }) {
  return (
    <article className="mt-12">
      {/* feature kicker */}
      <div
        className={`${TINY} flex items-center gap-3`}
        style={{ color: "var(--accent)" }}
      >
        <span>Feature</span>
        <span className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span style={{ color: "var(--text-3)" }}>头条</span>
      </div>

      <div className="mt-7 grid gap-8 md:grid-cols-[1.45fr_1fr] md:gap-10">
        {/* text column */}
        <div className="md:pr-10">
          <p
            className="italic leading-none"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-3)",
              fontSize: "clamp(26px, 4vw, 40px)",
            }}
          >
            Nº 01
          </p>

          <div className={`mt-4 ${TINY}`} style={{ color: "var(--text-2)" }}>
            {(post.tags[0] ?? "Field Notes")} · {fmtDate(post.publishedAt)} ·{" "}
            {post.likeCount} likes · {post.viewCount} views
          </div>

          <Link href={`/posts/${post.slug}`}>
            <h2
              className="mt-3"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(30px, 4.6vw, 48px)",
                lineHeight: 1.02,
              }}
            >
              {post.title}
            </h2>
          </Link>

          {post.summary && (
            <p
              className="mt-5 text-lg leading-relaxed"
              style={{ color: "var(--text-2)", fontFamily: "var(--font-body)" }}
            >
              {post.summary}
            </p>
          )}

          <p className={`mt-7 ${TINY}`} style={{ color: "var(--text-3)" }}>
            By {post.author.nickname}
          </p>
        </div>

        {/* plate column with vertical divider */}
        <div
          className="flex items-start justify-center md:border-l md:pl-10"
          style={{ borderColor: "var(--border)" }}
        >
          <Flower1 width={360} className="h-auto w-full max-w-[360px]" />
        </div>
      </div>
    </article>
  );
}
