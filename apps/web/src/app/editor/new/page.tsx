"use client";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useRequireAuth } from "@/lib/use-require-auth";

export default function NewPostPage() {
  const { ready } = useRequireAuth();
  if (!ready) return null;
  return <MarkdownEditor />;
}
