# 前端认证体验补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 `apps/web` 的认证体验：注册页、中文错误提示、GitHub 入口、头部用户菜单/登出/已登录重定向、头像上传、设置页。

**Architecture:** 纯前端（不改后端 app 代码）。新增工具层（错误文案映射、头像转换/上传）、复用组件（Avatar、UserMenu）、注册/设置页 + 登录页升级 + 头部挂载。登录态复用既有 `auth-context`，变更后统一 `refresh()`。一个 MinIO 基础设施任务（让头像可匿名读 + 浏览器可直传）。

**Tech Stack:** Next.js 16（App Router）+ React 19 + 既有 `api()` 客户端；MinIO（docker compose）；`@blog/shared` 类型。

**设计依据：** `docs/superpowers/specs/2026-06-13-auth-frontend-polish-design.md`

## 关键前置发现（实现前必读）

1. **`avatarUrl` 存的是对象 key，不是可用 URL。** 后端 `setAvatar` 存的是 `avatars/<userId>/<uuid>.webp` 这样的 key（见 `storage.service.confirm` 返回 key）。前端必须用一个公开基址把 key 解析成 URL：`avatarSrc(key) = ${NEXT_PUBLIC_S3_PUBLIC_URL}/${key}`，默认 `http://localhost:9000/blog`。这是对 spec §3 的细化（spec 假设 avatarUrl 可直接用）。
2. **MinIO bucket 当前私有（匿名 GET 返回 403）且无 CORS 配置。** Task 8 让 `blog` bucket 匿名可下载（头像渲染）+ 确认浏览器可直传（CORS）。`mc` 不在宿主机，用 `docker exec blog-minio mc ...`。这是 dev 取舍；生产应走 CDN/公开桶或后端签名 GET。
3. **CSS 变量名：** 用 `--text`（主文字）、`--text-2`、`--text-3`、`--border`、`--surface`、`--surface-2`、`--accent`。注意 `--text-1` **未定义**（既有 M4 组件误用了它，属既有遗留，不在本次范围）。
4. **`apps/web` 无测试 runner。** 每个前端任务以 `pnpm --filter @blog/web typecheck` + `lint` 收口，页面任务额外 `next build` 冒烟；纯逻辑（auth-errors/avatar）靠 typecheck + lint + 最终手动核对。不写假测试步骤。
5. 写前端前读 `apps/web/AGENTS.md`（Next.js 16 破坏性变更）。

---

## 文件结构

**`apps/web/src/lib/`**
- `auth-errors.ts`(新) — `authErrorMessage(code, fallback?)`
- `avatar.ts`(新) — `avatarSrc(key)` / `fileToWebp(file, size?)` / `uploadAvatar(file)`

**`apps/web/src/components/`**
- `Avatar.tsx`(新) — 圆形头像 + 首字母占位
- `UserMenu.tsx`(新) — 头部用户区（登录链接 / 头像下拉）

**`apps/web/src/app/`**
- `register/page.tsx`(新) ｜ `settings/page.tsx`(新)
- `login/page.tsx`(改) ｜ `layout.tsx`(改，挂 UserMenu)

**基础设施**
- `docker-compose.yml`（可能改，加 MinIO CORS env）｜ `.env.example`（加 `NEXT_PUBLIC_S3_PUBLIC_URL`）｜ MinIO bucket 匿名读策略（运行时 `mc` 命令）

---

## Task 1: 错误文案映射 `lib/auth-errors.ts`

**Files:** Create `apps/web/src/lib/auth-errors.ts`

- [ ] **Step 1: 实现**
```ts
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱或密码错误",
  EMAIL_TAKEN: "该邮箱已注册，请直接登录",
  ACCOUNT_LOCKED: "尝试过多，账号已锁定，请 15 分钟后再试",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  EMAIL_TAKEN_BIND_REQUIRED: "该邮箱已用邮箱密码注册，请用密码登录",
  GITHUB_ALREADY_BOUND: "该 GitHub 账号已绑定到其他用户",
  CANNOT_UNBIND_LAST_METHOD: "这是你唯一的登录方式，无法解绑",
  INVALID_UPLOAD: "图片不符合要求（≤2MB，jpg/png/webp）",
  VALIDATION_ERROR: "输入有误，请检查后重试",
  TOKEN_EXPIRED: "登录已过期，请重新登录",
  TOKEN_INVALID: "登录已过期，请重新登录",
};

/** Map an API ErrorCode to Chinese copy; fall back to the backend message, then a generic line. */
export function authErrorMessage(code: string | undefined, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback ?? "操作失败，请重试";
}
```

- [ ] **Step 2: 验证** — `pnpm --filter @blog/web typecheck` → PASS；`pnpm --filter @blog/web lint` → 0 errors。

- [ ] **Step 3: 提交**
```bash
git add apps/web/src/lib/auth-errors.ts
git commit -m "feat(web): auth error code -> Chinese message map"
```

---

## Task 2: 头像工具 `lib/avatar.ts`

**Files:** Create `apps/web/src/lib/avatar.ts`

- [ ] **Step 1: 实现**
```ts
import type { AuthUser } from "@blog/shared";
import { api, ApiClientError } from "./api";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "http://localhost:9000/blog";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

/** Resolve a stored avatar object key to a browser-loadable URL. */
export function avatarSrc(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    img.src = url;
  });
}

/** Cover-crop to a centered square and encode as webp. */
export async function fileToWebp(file: File, size = 256): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 canvas");
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("图片转换失败");
  return blob;
}

/** Full upload flow: presign -> convert to webp -> PUT -> confirm. Returns updated AuthUser. */
export async function uploadAvatar(file: File): Promise<AuthUser> {
  if (!ALLOWED.has(file.type)) {
    throw new ApiClientError("INVALID_UPLOAD", "图片格式不支持");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiClientError("INVALID_UPLOAD", "图片不能超过 2MB");
  }
  const { url, key } = await api<{ url: string; key: string }>(
    "/me/avatar/presign",
    { method: "POST" },
  );
  const webp = await fileToWebp(file);
  // Raw fetch (not api()): a presigned URL must NOT carry cookies, and its
  // signature requires exactly Content-Type: image/webp.
  const put = await fetch(url, {
    method: "PUT",
    body: webp,
    headers: { "Content-Type": "image/webp" },
  });
  if (!put.ok) {
    throw new ApiClientError("INVALID_UPLOAD", "上传失败，请重试");
  }
  return api<AuthUser>("/me/avatar/confirm", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}
```

- [ ] **Step 2: 验证** — `pnpm --filter @blog/web typecheck` → PASS；`lint` → 0 errors。

- [ ] **Step 3: 提交**
```bash
git add apps/web/src/lib/avatar.ts
git commit -m "feat(web): avatar src resolver + webp conversion + upload flow"
```

---

## Task 3: `components/Avatar.tsx`

**Files:** Create `apps/web/src/components/Avatar.tsx`

- [ ] **Step 1: 实现**
```tsx
import { avatarSrc } from "@/lib/avatar";

export function Avatar({
  nickname,
  avatarUrl,
  size = 32,
}: {
  nickname: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const dim = { width: size, height: size };
  if (avatarUrl) {
    return (
      <img
        src={avatarSrc(avatarUrl)}
        alt={nickname}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ ...dim, border: "1px solid var(--border)" }}
      />
    );
  }
  const initial = nickname.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full select-none"
      style={{
        ...dim,
        background: "var(--surface-2)",
        color: "var(--text-2)",
        fontSize: size * 0.45,
        border: "1px solid var(--border)",
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
```
NOTE: this uses a plain `<img>` (not `next/image`) because avatars come from MinIO at runtime; `next/image` would need remotePatterns config. ESLint may warn `@next/next/no-img-element` — if it errors (not warns), add a single-line `// eslint-disable-next-line @next/next/no-img-element` above the `<img>`. Prefer leaving it if it's only a warning.

- [ ] **Step 2: 验证** — `typecheck` → PASS；`lint` → 0 errors（按上面 NOTE 处理 img 规则）。

- [ ] **Step 3: 提交**
```bash
git add apps/web/src/components/Avatar.tsx
git commit -m "feat(web): Avatar component with initial fallback"
```

---

## Task 4: `components/UserMenu.tsx` + 头部挂载

**Files:** Create `apps/web/src/components/UserMenu.tsx`; Modify `apps/web/src/app/layout.tsx`

- [ ] **Step 1: UserMenu** `apps/web/src/components/UserMenu.tsx`:
```tsx
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
```

- [ ] **Step 2: 挂载到头部** — `apps/web/src/app/layout.tsx`

顶部 import 加 `import { UserMenu } from "@/components/UserMenu";`。
把头部右侧那段：
```tsx
            <div className="flex items-center gap-4">
              <Link href="/search" style={{ color: "var(--text-2)" }}>
                搜索
              </Link>
              <NotificationBell />
            </div>
```
改为在 `<NotificationBell />` 之后加一行 `<UserMenu />`：
```tsx
            <div className="flex items-center gap-4">
              <Link href="/search" style={{ color: "var(--text-2)" }}>
                搜索
              </Link>
              <NotificationBell />
              <UserMenu />
            </div>
```

- [ ] **Step 3: 验证** — `typecheck` → PASS；`lint` → 0 errors；`pnpm --filter @blog/web build` → 成功（头部挂了新客户端组件）。

- [ ] **Step 4: 提交**
```bash
git add apps/web/src/components/UserMenu.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): header user menu (login link / avatar dropdown + logout)"
```

---

## Task 5: 升级 `login/page.tsx`

**Files:** Modify `apps/web/src/app/login/page.tsx`

需求：客户端校验、错误经 `authErrorMessage`、读 URL 的 `?error=`（OAuth 回调）、加注册链接、已登录重定向。读 `?error` 用 `window.location.search`（不用 `useSearchParams`，避免 Next 的 Suspense 边界构建报错）。

- [ ] **Step 1: 用以下完整内容替换 `apps/web/src/app/login/page.tsx`**
```tsx
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
```

- [ ] **Step 2: 验证** — `typecheck` → PASS；`lint` → 0 errors。

- [ ] **Step 3: 提交**
```bash
git add "apps/web/src/app/login/page.tsx"
git commit -m "feat(web): login page — validation, Chinese errors, OAuth error param, register link, redirect-if-authed"
```

---

## Task 6: `register/page.tsx`

**Files:** Create `apps/web/src/app/register/page.tsx`

- [ ] **Step 1: 实现**
```tsx
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
```

- [ ] **Step 2: 验证** — `typecheck` → PASS；`lint` → 0 errors。

- [ ] **Step 3: 提交**
```bash
git add "apps/web/src/app/register/page.tsx"
git commit -m "feat(web): register page with client validation + GitHub entry"
```

---

## Task 7: `settings/page.tsx`

**Files:** Create `apps/web/src/app/settings/page.tsx`

三块：头像上传、资料（昵称/简介）、GitHub 状态/解绑。守门用既有 `useRequireAuth`。

- [ ] **Step 1: 实现**
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
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
      setNickname(user.nickname);
      setBio(user.bio ?? "");
    }
  }, [user]);

  if (!ready || !user) {
    return <main className="mx-auto max-w-lg px-6 py-24" />;
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
    <main className="mx-auto max-w-lg px-6 py-16">
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
```

- [ ] **Step 2: 验证** — `typecheck` → PASS；`lint` → 0 errors；`pnpm --filter @blog/web build` → 成功。

- [ ] **Step 3: 提交**
```bash
git add "apps/web/src/app/settings/page.tsx"
git commit -m "feat(web): settings page — avatar upload, profile edit, GitHub unbind"
```

---

## Task 8: MinIO 头像可读 + 直传 CORS + 公开基址 env

**Files:** Modify `.env.example`; possibly Modify `docker-compose.yml`; runtime `mc` commands (not committed).

目标：浏览器能 GET 头像（匿名读）+ 能 PUT 预签名上传（CORS）。`mc` 通过 `docker exec blog-minio mc` 运行。

- [ ] **Step 1: 让 `blog` bucket 匿名可下载**
```bash
docker exec blog-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec blog-minio mc anonymous set download local/blog
```
Expected: `Access permission for 'local/blog' is set to 'download'`.

- [ ] **Step 2: 验证匿名读已生效**（需先有一个对象；用 seed 用户上传或先放一个测试对象）
```bash
# 放一个测试对象再匿名 GET
echo test | docker exec -i blog-minio mc pipe local/blog/avatars/_probe.txt
curl -s -o /dev/null -w "anon GET: %{http_code}\n" "http://localhost:9000/blog/avatars/_probe.txt"
docker exec blog-minio mc rm local/blog/avatars/_probe.txt
```
Expected: `anon GET: 200`。若 403，重做 Step 1。

- [ ] **Step 3: 验证浏览器直传 CORS（预检）**
```bash
curl -s -i -X OPTIONS "http://localhost:9000/blog/avatars/x.webp" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type" | grep -i "access-control-allow" || echo "NO CORS HEADERS"
```
Expected: 出现 `Access-Control-Allow-Origin`（MinIO 默认对 S3 API 放行跨源）。**若输出 `NO CORS HEADERS`**，执行 Step 3b 配置后重试。

- [ ] **Step 3b（仅当 Step 3 无 CORS 头时）: 在 compose 给 MinIO 放行跨源并重启**

在 `docker-compose.yml` 的 `minio.environment` 下加：
```yaml
      MINIO_API_CORS_ALLOW_ORIGIN: "http://localhost:3000"
```
然后：
```bash
docker compose up -d minio
```
再重跑 Step 3，确认出现 `Access-Control-Allow-Origin`。

- [ ] **Step 4: 公开基址 env** — 在 `.env.example` 的对象存储段落（`S3_BUCKET=blog` 之后）加：
```bash
# 前端用：把头像 key 拼成可访问 URL（= S3_ENDPOINT/S3_BUCKET）
NEXT_PUBLIC_S3_PUBLIC_URL=http://localhost:9000/blog
```
（`avatar.ts` 已对该变量做了 `http://localhost:9000/blog` 默认回退，开发可不设。）

- [ ] **Step 5: 提交**（只提交受版本控制的文件；`mc` 策略是运行时状态）
```bash
git add .env.example docker-compose.yml 2>/dev/null
git commit -m "chore(infra): MinIO public-read for avatars + CORS note + NEXT_PUBLIC_S3_PUBLIC_URL" || echo "nothing to commit (no compose change needed)"
```
NOTE: 若 Step 3 默认就有 CORS 头、未改 compose，则只有 `.env.example` 变更被提交。MinIO 的匿名读策略不在 git 里——记到 `docs/` 或部署说明（见 Task 9 收尾）。

---

## Task 9: 全量校验 + 手动核对

**Files:** none (verification); optional doc note.

- [ ] **Step 1: 前端门禁** — `pnpm --filter @blog/web typecheck` → PASS；`pnpm --filter @blog/web lint` → 0 errors；`pnpm --filter @blog/web build` → 成功。
- [ ] **Step 2: 全仓 verify 不回归** — `pnpm verify` → 全绿。
- [ ] **Step 3: 手动核对清单**（`pnpm dev`，浏览器）
  - 注册新账号 → 自动登录 → 右上角出现头像（首字母占位）。
  - 退出登录 → 头部恢复「登录」链接。
  - 登录输错密码 → 显示「邮箱或密码错误」（中文）。
  - 访问 `http://localhost:3000/login?error=EMAIL_TAKEN_BIND_REQUIRED` → 显示对应中文。
  - 已登录访问 `/login` 或 `/register` → 自动跳首页。
  - 设置页上传头像（jpg/png）→ 右上角与设置页头像即时更新（验证 Task 8 的匿名读 + CORS 生效）。
  - 改昵称/简介 → 保存 → 刷新页面仍在。
  - 用 GitHub 登录的账号在设置页「解绑」；仅 GitHub 一种登录方式时解绑 → 中文拦截「这是你唯一的登录方式」。
- [ ] **Step 4: 记录 MinIO 运行时配置** — 在 `docs/plans/` 或 README 加一行说明：dev 需 `docker exec blog-minio mc anonymous set download local/blog`（避免他人 clone 后头像 403）。
```bash
git add -A && git commit -m "docs: note MinIO anonymous-read setup for avatars" || echo "nothing to commit"
```

---

## Self-Review 记录

**Spec 覆盖：**
- 注册页 → Task 6。表单校验匹配后端（邮箱/密码≥8/昵称1–40）→ Task 5/6 `validate()`。
- 中文错误提示（按 code 映射）→ Task 1 + 各页 catch。OAuth 回调 `?error=` → Task 5。
- GitHub 入口（登录+注册）→ Task 5/6 的 `<a>`；状态+解绑 → Task 7（仅 status+unbind，绑定按 spec 留后续）。
- 登录态管理（头部用户区/登出/已登录重定向）→ Task 4（UserMenu）+ Task 5/6（redirect）。
- 头像上传（选图→webp→直传→刷新）→ Task 2 + Task 7。Avatar 右上角框 → Task 3 + Task 4。
- 设置页（昵称/简介/头像/GitHub）→ Task 7。
- MinIO CORS（spec §9 风险点）→ Task 8，且补齐了 spec 未覆盖的「avatarUrl 是 key + 匿名读」问题。
- 收口（typecheck/lint/build/手动清单）→ 各任务 + Task 9。

**与 spec 的细化（已在「关键前置发现」列明）：** avatarUrl 是 key → 新增 `avatarSrc` + `NEXT_PUBLIC_S3_PUBLIC_URL` + MinIO 匿名读；CSS 用 `--text` 而非 spec 文中的 `--text-1`。

**类型一致性：** `authErrorMessage(code?, fallback?)`、`avatarSrc(key)`、`fileToWebp(file,size?)`、`uploadAvatar(file): Promise<AuthUser>`、`Avatar({nickname,avatarUrl,size?})`、`UserMenu()` 跨任务签名一致；均用既有 `api()`/`ApiClientError`/`useAuth()`/`useRequireAuth()`。

**无占位符：** 每个 code step 均为完整可粘贴代码 + 确切命令/预期；Task 8 的条件分支（3b）给了明确触发条件与回退。
