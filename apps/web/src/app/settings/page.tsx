"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import { api, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/use-require-auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { uploadAvatar } from "@/lib/avatar";
import { Avatar } from "@/components/Avatar";
import type { AuthUser } from "@blog/shared";

export default function SettingsPage() {
  const { ready } = useRequireAuth();
  const { user, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Seed the form once the user is loaded.
  useEffect(() => {
    if (user) {
      startTransition(() => {
        setNickname(user.nickname);
        setBio(user.bio ?? "");
      });
    }
  }, [user]);

  if (!ready || !user) {
    return <main className="mx-auto max-w-lg px-6 pb-24" />;
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    setMsg(null);
    try {
      await uploadAvatar(file);
      await refresh();
      setMsg("头像已更新");
    } catch (e2) {
      setErr(e2 instanceof ApiClientError ? authErrorMessage(e2.code, e2.message) : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = nickname.trim();
    if (n.length < 1 || n.length > 40) return setErr("昵称需为 1–40 个字符");
    if (bio.length > 500) return setErr("简介不能超过 500 字");
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api<AuthUser>("/me", { method: "PATCH", body: JSON.stringify({ nickname: n, bio }) });
      await refresh();
      setMsg("资料已保存");
    } catch (e2) {
      setErr(e2 instanceof ApiClientError ? authErrorMessage(e2.code, e2.message) : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function unbindGithub() {
    setErr(null);
    setMsg(null);
    try {
      await api<void>("/me/github", { method: "DELETE" });
      await refresh();
      setMsg("已解绑 GitHub");
    } catch (e2) {
      setErr(e2 instanceof ApiClientError ? authErrorMessage(e2.code, e2.message) : "解绑失败");
    }
  }

  const card = "rounded-lg border p-6 mt-6";
  const cardStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <main className="mx-auto max-w-lg px-6 pb-16">
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        设置
      </h1>
      {msg && <p className="mt-4" style={{ color: "var(--text-2)" }}>{msg}</p>}
      {err && <p className="mt-4" style={{ color: "var(--accent)" }}>{err}</p>}

      <section className={card} style={cardStyle}>
        <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>头像</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size={64} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-full border px-4 py-1.5 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            {uploading ? "上传中…" : "更换头像"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickAvatar}
            className="hidden"
          />
        </div>
      </section>

      <form className={card} style={cardStyle} onSubmit={saveProfile}>
        <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>资料</h2>
        <label htmlFor="nickname" className="mt-4 flex flex-col gap-1 text-sm" style={{ color: "var(--text-2)" }}>
          昵称
          <input
            id="nickname"
            type="text"
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded border px-3 py-2"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        <label htmlFor="bio" className="mt-3 flex flex-col gap-1 text-sm" style={{ color: "var(--text-2)" }}>
          简介
          <textarea
            id="bio"
            rows={4}
            maxLength={500}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="rounded border px-3 py-2"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-full px-5 py-2 text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </form>

      <section className={card} style={cardStyle}>
        <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>GitHub</h2>
        {user.githubLogin ? (
          <div className="mt-4 flex items-center justify-between">
            <span style={{ color: "var(--text-2)" }}>已绑定 @{user.githubLogin}</span>
            <button
              onClick={unbindGithub}
              className="rounded-full border px-4 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              解绑
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm" style={{ color: "var(--text-3)" }}>
            未绑定 GitHub
          </p>
        )}
      </section>
    </main>
  );
}
