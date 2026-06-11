"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { MarkdownStorage } from "tiptap-markdown";
import { api, ApiClientError } from "@/lib/api";
import type { PostDetail } from "@blog/shared";

interface Props {
  postId?: string;
  initialTitle?: string;
  initialMarkdown?: string;
}

interface EditorWithMarkdown {
  storage: { markdown: MarkdownStorage };
}

export function MarkdownEditor({ postId, initialTitle = "", initialMarkdown = "" }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: initialMarkdown,
    immediatelyRender: false,
  });

  function getMarkdown(): string {
    if (!editor) return "";
    return (editor as unknown as EditorWithMarkdown).storage.markdown.getMarkdown();
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = { title, contentMd: getMarkdown() };
      let post: PostDetail;
      if (postId) {
        post = await api<PostDetail>(`/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...body, status }),
        });
      } else {
        post = await api<PostDetail>("/posts", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (status === "PUBLISHED") {
          post = await api<PostDetail>(`/posts/${post.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          });
        }
      }
      router.push(status === "PUBLISHED" ? `/posts/${post.slug}` : `/editor/${post.slug}`);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        aria-label="标题"
        className="w-full text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      />
      <div className="mt-6 rounded border p-4" style={{ borderColor: "var(--border)" }}>
        <EditorContent editor={editor} />
      </div>
      {error && <p className="mt-3" style={{ color: "var(--accent)" }}>{error}</p>}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => void save("DRAFT")}
          disabled={busy}
          className="rounded-full border px-5 py-2 disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          存草稿
        </button>
        <button
          onClick={() => void save("PUBLISHED")}
          disabled={busy}
          className="rounded-full px-5 py-2 text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          发布
        </button>
      </div>
    </div>
  );
}
