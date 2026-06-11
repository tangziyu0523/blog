"use client";
import { use, useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useRequireAuth } from "@/lib/use-require-auth";
import { api, ApiClientError } from "@/lib/api";
import type { PostDetail } from "@blog/shared";

export default function EditPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    api<PostDetail>(`/posts/${slug}`)
      .then((p) => {
        if (active) startTransition(() => setPost(p));
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiClientError && e.code === "POST_NOT_FOUND") {
          router.replace("/");
        } else {
          startTransition(() => setError("加载失败"));
        }
      });
    return () => {
      active = false;
    };
  }, [ready, slug, router]);

  if (error) {
    return (
      <p className="mx-auto max-w-3xl px-6 py-24" style={{ color: "var(--accent)" }}>
        {error}
      </p>
    );
  }
  if (!ready || !post) return null;
  return (
    <MarkdownEditor postId={post.id} initialTitle={post.title} initialMarkdown={post.contentMd} />
  );
}
