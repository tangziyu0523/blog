import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/posts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { FollowButton } from "@/components/FollowButton";
import { ViewPing } from "@/components/ViewPing";
import { BackButton } from "@/components/BackButton";
import { PlateDivider } from "@/components/PlateDivider";
import { Foliage3, Butterfly2, Bird2 } from "@/components/illustrations";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <BackButton />
      <ViewPing postId={post.id} />
      <div className="relative">
        <Foliage3
          width={96}
          height={96}
          className="absolute -top-4 right-0 opacity-70"
        />
        <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>{post.title}</h1>
      </div>
      <p className="mt-2 italic" style={{ color: "var(--text-2)" }}>
        {post.author.nickname} · {(post.tags[0] ?? "未分类")} · {post.viewCount} views
      </p>
      <div className="mt-2"><FollowButton authorId={post.author.id} /></div>
      <PlateDivider illustration={Butterfly2} />
      <MarkdownRenderer markdown={post.contentMd} />
      <div className="my-8 flex flex-col items-center gap-3">
        <Bird2 width={72} height={72} className="opacity-70" aria-hidden />
        <p className="text-center italic" style={{ color: "var(--text-3)" }}>
          ✦ Naturalis Historia ✦
        </p>
      </div>
      <LikeButton postId={post.id} initialLiked={post.viewerLiked} initialCount={post.likeCount} />
      <CommentSection postId={post.id} postAuthorId={post.author.id} />
    </main>
  );
}
