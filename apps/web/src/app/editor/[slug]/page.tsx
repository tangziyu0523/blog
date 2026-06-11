"use client";
import { use, useEffect, useState, startTransition } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useRequireAuth } from "@/lib/use-require-auth";
import { api } from "@/lib/api";
import type { PostDetail } from "@blog/shared";

export default function EditPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { ready } = useRequireAuth();
  const [post, setPost] = useState<PostDetail | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    api<PostDetail>(`/posts/${slug}`)
      .then((p) => {
        if (active) startTransition(() => setPost(p));
      })
      .catch(() => {
        if (active) startTransition(() => setPost(null));
      });
    return () => {
      active = false;
    };
  }, [ready, slug]);

  if (!ready || !post) return null;
  return (
    <MarkdownEditor postId={post.id} initialTitle={post.title} initialMarkdown={post.contentMd} />
  );
}
