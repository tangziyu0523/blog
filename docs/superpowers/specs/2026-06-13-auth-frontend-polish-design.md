# 前端认证体验补齐（Auth Frontend Polish）设计

> 日期：2026-06-13 ｜ 作者：tangziyu ｜ 状态：已确认，待写实现计划
> 上游：`docs/prd.md` §3.1（用户系统）｜ 后端：M1 auth/users/storage（已完成）｜ 前端规范：`.claude/skills/nextjs/SKILL.md`

## 0. 背景与范围

M1 后端认证已完整实现（注册/登录/刷新/登出、GitHub OAuth、`/me` 读写、头像 presign/confirm、GitHub 解绑），但前端只有一个简陋的 `/login` 页和一个完善的 `auth-context`。本切片**只做 `apps/web`**，把认证的完整前端体验补齐：注册页、表单校验与中文错误提示、GitHub 入口、登录态管理（头部用户菜单/登出/已登录重定向）、头像上传流程、设置页。

**不改后端。** `apps/web` 无测试 runner → 以 typecheck + lint + `next build` + 手动核对清单收口（沿用 M4a/M4b 前端惯例）。

## 1. 目标与验收标准

- 访客可在 `/register` 注册：邮箱/密码/昵称，客户端校验匹配后端规则，成功后自动登录并跳首页。
- `/login` 与 `/register` 的接口错误、OAuth 回调错误（`?error=CODE`）均以**中文**呈现。
- 头部右上角有用户区：未登录显示「登录」，已登录显示头像下拉（设置 / 退出登录）。
- 已登录用户访问 `/login` 或 `/register` 自动重定向到首页。
- `/settings` 页可改昵称/简介、上传头像（选图 → 转 webp → 直传 → 即时刷新）、查看 GitHub 绑定状态并解绑。
- 头像变更后右上角与设置页即时反映（无需手动刷新页面）。
- 登出后回到未登录态，头部恢复「登录」。
- typecheck + lint 通过，`next build` 成功，手动核对清单全过。

## 2. 既有约定（必须复用，勿造平行实现）

- **登录态**：`apps/web/src/lib/auth-context.tsx` 的 `useAuth()` → `{ user, loading, refresh, logout }`。资料/头像变更后统一调 `refresh()` 重新拉 `/me` 同步全局，不另写 setUser。
- **fetch 客户端**：`apps/web/src/lib/api.ts` 的 `api<T>(path, init?)`（自动带 credentials、JSON 头、204 处理、抛 `ApiClientError`（含 `.code`/`.message`））。
- **守门 hook**：`apps/web/src/lib/use-require-auth.ts`（已存在，未登录跳 `/login`）用于 `/settings`。
- **乐观/防重**：表单与按钮的 `busy` guard、`ApiClientError` 的 `TOKEN_INVALID`/`TOKEN_EXPIRED` → `/login`，参考 `LikeButton.tsx`/`FollowButton.tsx`。
- **视觉**：Naturalist Journal 单色极简（CSS 变量 `--text-1/2/3`、`--border`、`--surface`、`--accent`、`--font-display/body`）。
- **Next.js 注意**：`apps/web/AGENTS.md` —— Next.js 16 有破坏性变更，写前端前查 `node_modules/next/dist/docs/`。

## 3. 后端契约（只读，不改）

- `POST /auth/register` `{ email, password, nickname }` → 种 cookie，返回 `AuthUser`。校验：email 格式、password 8–128、nickname 1–40。限流 10/min。
- `POST /auth/login` `{ email, password }` → 200，种 cookie，返回 `AuthUser`。限流 10/min。
- `POST /auth/logout` → 204，吊销并清 cookie。
- `GET /auth/github?redirect=...` → 302 跳 GitHub。回调成功 → `WEB_ORIGIN/`；失败 → `WEB_ORIGIN/login?error=CODE`（如 `EMAIL_TAKEN_BIND_REQUIRED`、`TOKEN_INVALID`）。
- `GET /me` → `AuthUser`。`PATCH /me` `{ nickname?, bio? }`（bio≤500）→ `AuthUser`。
- `DELETE /me/github` → 解绑；唯一登录方式时报 `CANNOT_UNBIND_LAST_METHOD`。
- `POST /me/avatar/presign` → `{ url, key }`（url 为 MinIO 预签名 PUT，固定 `image/webp`，5 分钟有效）。
- `POST /me/avatar/confirm` `{ key }` → 校验对象存在并回写头像，返回 `AuthUser`。

`AuthUser`（`@blog/shared`）：`{ id, email, nickname, bio: string|null, avatarUrl: string|null, githubLogin: string|null }`。

相关 `ErrorCode`：`VALIDATION_ERROR`、`EMAIL_TAKEN`、`INVALID_CREDENTIALS`、`ACCOUNT_LOCKED`、`RATE_LIMITED`、`TOKEN_EXPIRED`、`TOKEN_INVALID`、`EMAIL_TAKEN_BIND_REQUIRED`、`GITHUB_ALREADY_BOUND`、`CANNOT_UNBIND_LAST_METHOD`、`INVALID_UPLOAD`。

## 4. 工具层（`apps/web/src/lib`）

**`auth-errors.ts`** — `authErrorMessage(code: string | undefined, fallback?: string): string`
- `ErrorCode`→中文映射：
  - `INVALID_CREDENTIALS` → “邮箱或密码错误”
  - `EMAIL_TAKEN` → “该邮箱已注册，请直接登录”
  - `ACCOUNT_LOCKED` → “尝试过多，账号已锁定，请 15 分钟后再试”
  - `RATE_LIMITED` → “操作过于频繁，请稍后再试”
  - `EMAIL_TAKEN_BIND_REQUIRED` → “该邮箱已用邮箱密码注册，请用密码登录”
  - `GITHUB_ALREADY_BOUND` → “该 GitHub 账号已绑定到其他用户”
  - `CANNOT_UNBIND_LAST_METHOD` → “这是你唯一的登录方式，无法解绑”
  - `INVALID_UPLOAD` → “图片不符合要求（≤2MB，jpg/png/webp）”
  - `VALIDATION_ERROR` → “输入有误，请检查后重试”
  - `TOKEN_EXPIRED` / `TOKEN_INVALID` → “登录已过期，请重新登录”
- 未命中：返回 `fallback`（即后端 message）或通用“操作失败，请重试”。

**`avatar.ts`**
- `fileToWebp(file: File, size = 256): Promise<Blob>` — 用 `Image` + `canvas` 把图片**等比 cover 裁成 size×size 正方形**再 `toBlob('image/webp', 0.9)`。无裁剪框（自动居中裁剪）。
- `uploadAvatar(file: File): Promise<AuthUser>` —
  1. `api<{ url; key }>('/me/avatar/presign', { method:'POST' })`
  2. `fileToWebp(file)` 得 webp Blob
  3. 原生 `fetch(url, { method:'PUT', body: blob, headers:{ 'Content-Type':'image/webp' } })` —— **不带 credentials/不经 `api()`**（预签名 URL 不能带 cookie，且签名 Content-Type 必须为 image/webp）。非 2xx 抛错。
  4. `api<AuthUser>('/me/avatar/confirm', { method:'POST', body: JSON.stringify({ key }) })`
- 客户端前置校验：文件类型 ∈ {jpeg,png,webp}、大小 ≤2MB，不符直接抛带提示的错误（避免无谓上传）。

## 5. 复用组件（`apps/web/src/components`）

**`Avatar.tsx`** — `{ user: Pick<AuthUser,'nickname'|'avatarUrl'>, size?: number }`。有 `avatarUrl` 渲染圆形 `<img>`；否则渲染昵称首字符占位（圆底 + 次级表面色）。装饰性，`alt` 取昵称。

**`UserMenu.tsx`**（client）— 头部右上角用户区：
- `loading` → 占位（空或骨架）。
- 未登录 → `登录` 链接（→ `/login`）。
- 已登录 → `Avatar` 按钮，点击展开下拉：`设置`（→ `/settings`）、`退出登录`（调 `logout()` → `router.push('/')`）。点击外部关闭。

## 6. 页面

**`register/page.tsx`**（新）
- 表单：邮箱、密码、昵称。客户端校验：邮箱正则、密码 ≥8、昵称 1–40，错误内联显示在字段下。
- 提交 `POST /auth/register` → 成功（已种 cookie）→ `refresh()` → `router.push('/')`。错误经 `authErrorMessage` 显示。
- GitHub 按钮（`<a href="${API}/auth/github?redirect=/">`）。底部链到 `/login`。
- 已登录（`user && !loading`）→ `useEffect` 重定向 `/`。

**`login/page.tsx`**（改）
- 现有邮箱/密码表单基础上：加客户端校验；错误统一走 `authErrorMessage(e.code, e.message)`；读 `useSearchParams().get('error')` 经 `authErrorMessage` 显示 OAuth 回调错误。
- 加链到 `/register`。GitHub 入口保留并统一为按钮样式。
- 已登录 → 重定向 `/`。

**`settings/page.tsx`**（新）— `useRequireAuth` 守门。三块卡片：
1. **头像**：当前 `Avatar`（大）+「更换头像」文件选择 → `uploadAvatar(file)` → `refresh()`；上传中禁用 + 提示；错误经 `authErrorMessage`。
2. **资料**：昵称（1–40）、简介（≤500，textarea）→「保存」`PATCH /me` → `refresh()`；成功给轻提示。
3. **GitHub**：显示 `githubLogin` 绑定状态。已绑定 → 显示 `@login` +「解绑」按钮（`DELETE /me/github` → `refresh()`；捕获 `CANNOT_UNBIND_LAST_METHOD` 给中文提示）。未绑定 → 显示「未绑定」状态文案（**不提供绑定按钮** —— 后端暂不支持 session-aware 绑定，留作后续）。

**`layout.tsx`**（改）— 头部右侧 `搜索 / NotificationBell` 一行末尾加入 `<UserMenu />`（最右）。

## 7. 登录态与错误处理

- 全局态复用 `auth-context`；任何资料/头像/解绑变更后调 `refresh()` 同步。
- 已登录重定向：登录/注册页 `useEffect(() => { if (user && !loading) router.replace('/'); }, [user, loading])`。
- 表单：`busy` guard 防重复提交；catch `ApiClientError` → `authErrorMessage`；非 `ApiClientError` → 通用文案。

## 8. 测试与收口

- `authErrorMessage` / `avatar.ts` 逻辑：typecheck + lint 保障（无独立 runner）。
- `next build` 冒烟（确认新页面/客户端组件构建通过）。
- **手动核对清单**：注册→自动登录→右上角出现头像；登录输错→中文错误；OAuth 回调 `?error=` →中文；上传头像→右上角即时更新；改昵称/简介→持久化（刷新仍在）；GitHub 解绑；唯一登录方式解绑被中文拦截；已登录访问 `/login` 跳走；登出→头部恢复「登录」。

## 9. 依赖 / 风险

- **MinIO CORS**：浏览器从 `localhost:3000` 直传预签名 PUT 到 MinIO（`S3_ENDPOINT`，开发为 `localhost:9000`）需要 bucket 配置 CORS 允许来自 web 源的 `PUT`。计划阶段含一步「检查并按需配置 MinIO CORS」（通过 mc 或 compose 初始化），否则上传会被浏览器 CORS 拦截。

## 10. 明确不做

后端任何改动；GitHub「绑定到现有账号」（需后端 session-aware bind 端点）；忘记密码 / 邮箱验证邮件（M1 未实现）；头像裁剪框交互（用等比自动裁剪替代）；记住登录/多设备会话管理 UI。
