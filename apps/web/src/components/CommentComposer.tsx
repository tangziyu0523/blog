"use client";

import { useState } from "react";

export function CommentComposer({
  placeholder,
  initial = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-md border p-3 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", fontFamily: "var(--font-body)" }}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-full border px-4 py-1.5 text-sm disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm" style={{ color: "var(--text-3)" }}>
            取消
          </button>
        )}
        <span className="text-xs italic" style={{ color: "var(--text-3)" }}>
          支持 **粗体** · `代码` · [链接](https://…)
        </span>
      </div>
    </div>
  );
}
