import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/posts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>{post.title}</h1>
      <p className="mt-2 italic" style={{ color: "var(--text-2)" }}>
        {post.author.nickname} · {(post.tags[0] ?? "未分类")}
      </p>
      <hr className="my-8" style={{ borderColor: "var(--border)" }} />
      <MarkdownRenderer markdown={post.contentMd} />
      <p className="my-8 text-center italic" style={{ color: "var(--text-3)" }}>
        ✦ Naturalis Historia ✦
      </p>
      <LikeButton postId={post.id} initialLiked={post.viewerLiked} initialCount={post.likeCount} />
      <CommentSection postId={post.id} postAuthorId={post.author.id} />
    </main>
  );
}
