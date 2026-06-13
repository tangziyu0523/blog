"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { authErrorMessage } from "@/lib/auth-errors";
import type { AuthUser } from "@blog/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  function validate(): string | null {
    if (!EMAIL_RE.test(email)) return "请输入有效的邮箱";
    if (password.length < 8) return "密码至少 8 位";
    const n = nickname.trim();
    if (n.length < 1 || n.length > 40) return "昵称需为 1–40 个字符";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validate();
    if (v) return setError(v);
    setBusy(true);
    setError(null);
    try {
      await api<AuthUser>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, nickname: nickname.trim() }),
      });
      await refresh();
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? authErrorMessage(err.code, err.message)
          : "注册失败，请重试",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        注册
      </h1>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <label htmlFor="email" className="flex flex-col gap-1" style={{ color: "var(--text-2)" }}>
          邮箱
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        <label htmlFor="nickname" className="flex flex-col gap-1" style={{ color: "var(--text-2)" }}>
          昵称
          <input
            id="nickname"
            type="text"
            required
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded border px-3 py-2"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        <label htmlFor="password" className="flex flex-col gap-1" style={{ color: "var(--text-2)" }}>
          密码（至少 8 位）
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-3 py-2"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        {error && <p style={{ color: "var(--accent)" }}>{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full px-5 py-2 text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "注册中…" : "注册"}
        </button>
      </form>
      <a
        href={`${API}/auth/github?redirect=/`}
        className="mt-4 block text-center underline"
        style={{ color: "var(--text-2)" }}
      >
        使用 GitHub 注册
      </a>
      <p className="mt-6 text-center text-sm" style={{ color: "var(--text-2)" }}>
        已有账号？
        <Link href="/login" className="underline">
          登录
        </Link>
      </p>
    </main>
  );
}
