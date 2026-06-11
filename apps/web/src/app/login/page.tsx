"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AuthUser } from "@blog/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "登录失败");
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        登录
      </h1>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        />
        <input
          type="password"
          required
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        />
        {error && <p style={{ color: "var(--accent)" }}>{error}</p>}
        <button
          type="submit"
          className="rounded-full px-5 py-2 text-white"
          style={{ background: "var(--accent)" }}
        >
          登录
        </button>
      </form>
      <a
        href={`${API}/auth/github`}
        className="mt-4 block text-center underline"
        style={{ color: "var(--text-2)" }}
      >
        使用 GitHub 登录
      </a>
    </main>
  );
}
