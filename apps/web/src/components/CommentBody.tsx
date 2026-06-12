"use client";

import { renderCommentMarkdown } from "@blog/shared";

export function CommentBody({ markdown }: { markdown: string }) {
  return (
    <div
      className="leading-relaxed"
      style={{ fontFamily: "var(--font-body)", color: "var(--text-1)" }}
      dangerouslySetInnerHTML={{ __html: renderCommentMarkdown(markdown) }}
    />
  );
}
