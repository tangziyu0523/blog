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
  initialSummary?: string;
  initialTags?: string[];
}

interface EditorWithMarkdown {
  storage: { markdown: MarkdownStorage };
}

const MAX_TAGS = 5;
const MAX_TAG_LEN = 30;
const MAX_SUMMARY = 150;

export function MarkdownEditor({
  postId,
  initialTitle = "",
  initialMarkdown = "",
  initialSummary = "",
  initialTags = [],
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
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

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (t.length > MAX_TAG_LEN) {
      setError(`标签最长 ${MAX_TAG_LEN} 字`);
      return;
    }
    if (tags.includes(t)) {
      setError(null);
      setTagInput("");
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setError(`最多 ${MAX_TAGS} 个标签`);
      return;
    }
    setError(null);
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  // tags/summary are sent unconditionally: an empty array clears tags and `null`
  // clears the summary on a PATCH. The backend only writes fields that are
  // present, so omitting them would make removal impossible. The create
  // endpoint accepts `[]` and `null` too (both fields are @IsOptional()).
  function buildBody(): { title: string; contentMd: string; tags: string[]; summary: string | null } {
    return {
      title,
      contentMd: getMarkdown(),
      tags,
      summary: summary.trim() || null,
    };
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (busy) return;
    const md = getMarkdown();
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    if (!md.trim()) {
      setError("请填写正文");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildBody();
      if (postId) {
        const post = await api<PostDetail>(`/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...body, status }),
        });
        router.push(status === "PUBLISHED" ? `/posts/${post.slug}` : `/editor/${post.slug}`);
        return;
      }
      const created = await api<PostDetail>("/posts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (status === "DRAFT") {
        router.push(`/editor/${created.slug}`);
        return;
      }
      try {
        const published = await api<PostDetail>(`/posts/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        router.push(`/posts/${published.slug}`);
      } catch {
        // 草稿已建但发布失败 —— 落到它的编辑页，便于单次原子 PATCH 重试，避免变成不可见的孤儿。
        router.push(`/editor/${created.slug}`);
      }
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-12">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        aria-label="标题"
        className="w-full text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      />

      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value.slice(0, MAX_SUMMARY))}
        placeholder="摘要（选填，显示在文章卡片上）"
        aria-label="摘要"
        rows={2}
        className="mt-4 w-full resize-none rounded border p-3 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
      />
      <div className="mt-1 text-right text-xs" style={{ color: "var(--text-3)" }}>
        {summary.length}/{MAX_SUMMARY}
      </div>

      <div
        className="mt-3 flex flex-wrap items-center gap-2 rounded border p-2"
        style={{ borderColor: "var(--border)" }}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            {t}
            <button
              type="button"
              aria-label={`移除标签 ${t}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
              style={{ color: "var(--text-3)" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={onTagKeyDown}
          onBlur={addTag}
          placeholder={tags.length >= MAX_TAGS ? "" : "标签，回车添加"}
          aria-label="添加标签"
          disabled={tags.length >= MAX_TAGS}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

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
