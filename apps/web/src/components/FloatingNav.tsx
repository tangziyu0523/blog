"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { useAuth } from "@/lib/auth-context";
import { useUnreadCount } from "@/lib/use-unread-count";
import {
  IconSearch,
  IconBell,
  IconPencil,
  IconList,
  IconGear,
  IconExit,
  IconLogin,
  IconClose,
  IconCompass,
} from "./nav-icons";

type IconCmp = ({ size, className }: { size?: number; className?: string }) => React.ReactElement;

interface NavItem {
  key: string;
  label: string;
  Icon: IconCmp;
  href?: string;
  onClick?: () => void;
  dot?: boolean;
}

function scrollToTop() {
  const s = ScrollSmoother.get();
  if (s) s.scrollTo(0, true);
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

export function FloatingNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 顶栏滚出视口后才显形。IntersectionObserver 在 ScrollSmoother transform 下仍按渲染位置判断。
  useEffect(() => {
    const header = document.getElementById("site-header");
    if (!header) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(header);
    return () => io.disconnect();
  }, []);

  // 点击外部 / Esc 收起
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: NavItem[] = user
    ? [
        { key: "search", label: "搜索", Icon: IconSearch, href: "/search" },
        { key: "notif", label: "通知", Icon: IconBell, onClick: scrollToTop, dot: unread > 0 },
        { key: "write", label: "写文章", Icon: IconPencil, href: "/editor/new" },
        { key: "mine", label: "我的文章", Icon: IconList, href: "/me/posts" },
        { key: "settings", label: "设置", Icon: IconGear, href: "/settings" },
        {
          key: "logout",
          label: "退出登录",
          Icon: IconExit,
          onClick: () => {
            void logout().then(() => router.push("/"));
          },
        },
      ]
    : [
        { key: "search", label: "搜索", Icon: IconSearch, href: "/search" },
        { key: "login", label: "登录", Icon: IconLogin, href: "/login" },
      ];

  if (!visible) return null;

  function renderItem(item: NavItem) {
    const inner = (
      <span
        className="relative flex h-11 w-11 items-center justify-center rounded-full border shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      >
        <item.Icon size={18} />
        {item.dot && (
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
            aria-hidden="true"
          />
        )}
      </span>
    );
    const label = (
      <span
        className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
      >
        {item.label}
      </span>
    );
    const common = "group relative block";
    if (item.href) {
      return (
        <Link
          key={item.key}
          href={item.href}
          aria-label={item.label}
          onClick={() => setOpen(false)}
          className={common}
        >
          {label}
          {inner}
        </Link>
      );
    }
    return (
      <button
        key={item.key}
        type="button"
        aria-label={item.label}
        onClick={() => {
          item.onClick?.();
          setOpen(false);
        }}
        className={common}
      >
        {label}
        {inner}
      </button>
    );
  }

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
      {open && <div className="flex flex-col items-center gap-3">{items.map(renderItem)}</div>}
      <button
        type="button"
        aria-label="导航"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-full border shadow-md"
        style={{ height: 52, width: 52, borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      >
        {open ? <IconClose size={20} /> : <IconCompass size={22} />}
      </button>
    </div>
  );
}
