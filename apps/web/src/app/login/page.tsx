"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { authErrorMessage } from "@/lib/auth-errors";
import type { AuthUser } from "@blog/shared";
import { BackButton } from "@/components/BackButton";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already logged in -> go home.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  // Surface a GitHub OAuth callback error (?error=CODE).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (code) setError(authErrorMessage(code));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email)) return setError("请输入有效的邮箱");
    if (password.length < 1) return setError("请输入密码");
    setBusy(true);
    setError(null);
    try {
      await api<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? authErrorMessage(err.code, err.message)
          : "登录失败，请重试",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <BackButton />
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        登录
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
        <label htmlFor="password" className="flex flex-col gap-1" style={{ color: "var(--text-2)" }}>
          密码
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
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
      <a
        href={`${API}/auth/github?redirect=/`}
        className="mt-4 block text-center underline"
        style={{ color: "var(--text-2)" }}
      >
        使用 GitHub 登录
      </a>
      <p className="mt-6 text-center text-sm" style={{ color: "var(--text-2)" }}>
        还没有账号？
        <Link href="/register" className="underline">
          注册
        </Link>
      </p>
    </main>
  );
}
