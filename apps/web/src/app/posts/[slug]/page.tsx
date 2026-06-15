import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/posts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { FollowButton } from "@/components/FollowButton";
import { ViewPing } from "@/components/ViewPing";
import { BackButton } from "@/components/BackButton";
import { pickPlateIndex } from "@/lib/article-plate";
import {
  Bird1, Bird2, Butterfly1, Butterfly2, Butterfly3, Butterfly4,
  Flower1, Flower2, Foliage1, Foliage2, Foliage3, Foliage4,
} from "@/components/illustrations";

const PLATES = [
  Bird1, Bird2, Butterfly1, Butterfly2, Butterfly3, Butterfly4,
  Flower1, Flower2, Foliage1, Foliage2, Foliage3, Foliage4,
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(iso: string | null): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  if (!post) notFound();

  const Plate = PLATES[pickPlateIndex(post.slug, PLATES.length)];

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24">
      <BackButton />
      <ViewPing postId={post.id} />

      <header>
        <p
          className="font-sans text-[11px] uppercase tracking-[0.25em]"
          style={{ color: "var(--accent)" }}
        >
          {post.tags[0] ?? "Field Notes"}
        </p>
        <h1
          className="mt-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(34px, 5vw, 52px)",
            lineHeight: 1.08,
          }}
        >
          {post.title}
        </h1>
        <p className="mt-4 text-sm italic" style={{ color: "var(--text-2)" }}>
          {post.author.nickname} · {fmtDate(post.publishedAt)} · {post.viewCount} views
        </p>
        <div className="mt-3">
          <FollowButton authorId={post.author.id} />
        </div>
      </header>

      <hr className="mt-8 mb-10" style={{ borderColor: "var(--border)" }} />

      <MarkdownRenderer markdown={post.contentMd} />

      <div className="mt-16 flex flex-col items-center gap-4">
        <Plate width={88} height={88} className="opacity-80" />
        <p className="text-center italic" style={{ color: "var(--text-3)" }}>
          ✦ Naturalis Historia ✦
        </p>
      </div>

      <div className="mt-8">
        <LikeButton postId={post.id} initialLiked={post.viewerLiked} initialCount={post.likeCount} />
      </div>
      <CommentSection postId={post.id} postAuthorId={post.author.id} />
    </main>
  );
}
