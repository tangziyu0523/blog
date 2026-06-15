"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "./Avatar";

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (loading) return <span style={{ width: 32, height: 32 }} aria-hidden="true" />;

  if (!user) {
    return (
      <Link href="/login" style={{ color: "var(--text-2)" }}>
        登录
      </Link>
    );
  }

  async function onLogout() {
    await logout();
    setOpen(false);
    router.push("/");
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="用户菜单" className="flex">
        <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size={32} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-40 rounded-md border py-1 z-20"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <Link
            href="/editor/new"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            写文章
          </Link>
          <Link
            href="/me/posts"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            我的文章
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            设置
          </Link>
          <button
            onClick={onLogout}
            className="block w-full px-3 py-2 text-left text-sm"
            style={{ color: "var(--text-2)" }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
