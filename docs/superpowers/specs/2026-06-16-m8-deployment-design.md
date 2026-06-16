# M8 部署设计：Vercel + Railway + Cloudflare R2

- 日期：2026-06-16
- 里程碑：M8（部署，P0）
- 状态：已确认，待实现

## 背景与前提勘误

原始拓扑设想包含 `apps/worker`、pgvector 依赖、Railway 桶等假设。代码勘验后三处需修正：

1. **`apps/worker` 不存在，也没有 BullMQ。** `apps/` 仅有 `api` 与 `web`。Redis 经 `ioredis` 直接使用（浏览量去重等），通知是**进程内 SSE 流**（`NotificationStreamService` + NestJS `@Sse`），不是队列。故本里程碑**不部署 worker**，待 AI/定时任务（PRD P1/P2）引入真实队列时再加。

2. **当前没有任何 migration 使用 pgvector。** M3 搜索是纯 Postgres FTS——`to_tsvector('simple', …)` 加权 `tsvector` + GIN 索引（`20260611151203_add_post_search`），无 `vector` 列、无 embedding。本地用 `pgvector/pgvector:pg16` 镜像但无扩展依赖。Railway 托管 Postgres 支持 `CREATE EXTENSION vector`，将来需要时经 migration 启用即可，不阻塞。

3. **真正的阻塞项：跨站认证 Cookie。** 认证用 httpOnly Cookie，`sameSite: 'lax'` 且带 `domain`（`apps/api/src/auth/cookies.ts`）。若 web 在 `*.vercel.app`、api 在 `*.railway.app`（不同可注册域），浏览器视每次 API 调用为**跨站**，`SameSite=Lax` Cookie **不会被发送** → 登录/刷新/所有鉴权路由失效。此项决定整体拓扑。

## 已确认决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 域名/认证 | **自有域名 + 共享父域** | web=apex（`example.com`），api=`api.example.com`，Cookie `domain=.example.com` 保持 `SameSite=Lax` 为第一方，无 ITP/三方 Cookie 风险。现有 `cookies.ts` 无需改动 |
| Worker | **本期不部署** | 无队列代码，避免空跑服务 |
| 对象存储 | **Cloudflare R2** | S3 兼容、零出口费（适合图片分发）、成熟、支持公开桶 + 自定义域；`storage.service.ts` 原样可用 |
| CI/CD | **CI 绿灯后才部署** | GitHub Actions verify/e2e 通过后再触发两平台部署，防止带病发布 |
| 域名/DNS | **已有域名，DNS 托管 Cloudflare** | 与 R2 同生态，便于 R2 自定义域与 apex/api 记录 |
| 规范主机 | **apex `example.com`**，`www` 301 跳 apex | 单一规范源，保持单 origin + Cookie 简单 |
| 数据库迁移 | **Railway pre-deploy 命令** | 新容器接流前运行 `prisma migrate deploy` |
| 健康检查 | **新增 `GET /health`** | 供 Railway 健康检查 |

> `example.com` 为占位，实现时替换为真实域名。

## 目标拓扑

```
Cloudflare DNS (example.com)
├── example.com, www→example.com   ──► Vercel        (apps/web, Next.js)
├── api.example.com                ──► Railway        (apps/api, NestJS)
└── cdn.example.com                ──► Cloudflare R2  (公开图片桶)

Railway 项目 "blog-prod"
├── api        (Dockerfile, 自定义域 api.example.com)
├── Postgres   (托管；将来经 migration 启用 vector 扩展)
└── Redis      (托管)
```

web 与 api 同处 `*.example.com` 第一方，现有 `SameSite=Lax` Cookie 不改即可用。

## 认证为何此时可用

- `COOKIE_DOMAIN=.example.com` → `api.example.com` 下发的 Cookie 会在来自 `example.com` 的请求中携带。`cookies.ts` 不改。
- `WEB_ORIGIN=https://example.com`（单一规范主机）满足 CORS `credentials:true`。
- `TRUST_PROXY=1`（Railway 在代理后终止 TLS），使 `req.ip` 与 secure Cookie 行为正确；`main.ts` 已从 env 读取 `trust proxy`。
- GitHub OAuth 应用配置生产回调 `https://api.example.com/auth/github/callback`。

## 环境变量

### Vercel（web）— 构建期，Production scope

> `NEXT_PUBLIC_*` 在构建时被内联进浏览器包，必须是构建期变量，不是运行期。

| 变量 | 值 |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.example.com` |
| `NEXT_PUBLIC_S3_PUBLIC_URL` | `https://cdn.example.com` |

### Railway（api）— 运行期

| 变量 | 值 |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`（Railway 引用） |
| `REDIS_URL` | `${{Redis.REDIS_URL}}`（Railway 引用） |
| `WEB_ORIGIN` | `https://example.com` |
| `COOKIE_DOMAIN` | `.example.com` |
| `GITHUB_CALLBACK_URL` | `https://api.example.com/auth/github/callback` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 API token |
| `S3_BUCKET` | `blog-prod` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥32 字符随机串 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 生产 OAuth 应用 |
| `ANTHROPIC_API_KEY` | LLM 网关（需要时） |

跨服务引用说明：`NEXT_PUBLIC_API_URL` 用稳定公开域名（非 Railway 内部引用），因为它会进浏览器包；Railway 内部 `${{...}}` 引用仅在 Railway 内解析。`PORT` 由 Railway 注入，`main.ts` 已用 `getOrThrow('PORT')` 读取。`env.validation.ts` 的 zod schema 覆盖以上全部 api 变量，生产值满足校验。

## 对象存储（R2）

- `storage.service.ts` **原样可用**：`forcePathStyle:true` + 显式 endpoint + region `us-east-1` 均与 R2 兼容，无需改代码。
- R2 桶 `blog-prod`，公开访问经自定义域 `cdn.example.com` 暴露。预签名 PUT 走 S3 API endpoint；公开 GET 走 cdn 域（与 `NEXT_PUBLIC_S3_PUBLIC_URL` 一致）。
- **必须配置 R2 桶 CORS**，允许从 `https://example.com` 发起 `PUT`——浏览器用预签名 URL 直传 R2，缺此项则图片上传失败。

## 构建与迁移

- **api**：新增 `apps/api/Dockerfile`（多阶段：pnpm 安装 workspace → 构建 `@blog/shared` → `prisma generate` → `nest build` → 精简运行镜像，保留 `prisma` CLI 与 schema 以供迁移）。Railway 以仓库根为上下文用此 Dockerfile 构建。需配套 `.dockerignore`。
- **迁移**：Railway **pre-deploy 命令** `pnpm --filter @blog/api exec prisma migrate deploy`，在构建后、新容器接流前运行。迁移为前向兼容（增量），满足 PRD 单实例 99.5% 目标，无需蓝绿。
- **web**：Vercel 根目录 `apps/web`；构建用 `turbo build --filter=@blog/web` 以先构建 `@blog/shared`。

## CI/CD（CI 绿灯后部署）

在 `.github/workflows/ci.yml` 增加 `deploy` job：

- `needs: [verify, e2e]`，`if: github.ref == 'refs/heads/main' && github.event_name == 'push'`。
- 关闭两平台自身的 push 自动部署，由此 job 触发：Vercel 用 `vercel deploy --prod`（或 deploy hook），Railway 用 `railway up`/部署触发。仓库 secrets：`VERCEL_TOKEN`、`RAILWAY_TOKEN`。
- 结果：测试或 e2e 失败会阻断两处部署。

## 需要的代码改动（均较小）

| 文件 | 改动 |
|---|---|
| `apps/api/Dockerfile`（新增） | 多阶段构建 + 运行镜像 |
| `apps/api/.dockerignore`（新增） | 排除 node_modules/dist 等 |
| `apps/api/src/**`（新增 health） | `GET /health` 端点（轻量，返回 200） |
| `.github/workflows/ci.yml` | 增加 gated `deploy` job |
| `.env.example` | 补充生产形态注释（不含真实密钥） |

**无应用逻辑改动**：`cookies.ts`、CORS、`storage.service.ts` 均不动。

## 手动一次性前置清单

1. 将域名 DNS 迁至 Cloudflare。
2. 创建 R2 桶 + API token + `cdn.example.com` 自定义域 + CORS 策略。
3. 创建 Railway 项目，加 Postgres + Redis，加 api 服务 + `api.example.com` 域，开启每日数据库备份（PRD 要求）。
4. 创建 Vercel 项目，根目录 `apps/web`，配置域名与 env。
5. 注册生产 GitHub OAuth 应用（回调 + 主页 URL）。
6. 配置 CI 部署 secrets（`VERCEL_TOKEN`、`RAILWAY_TOKEN`）。

## 验收要点

- main 合并后，CI 绿灯触发部署，web/api 自动上线。
- 生产环境可注册/登录（含 GitHub OAuth），鉴权路由正常（跨子域 Cookie 生效）。
- 编辑器图片直传 R2 成功，图片经 `cdn.example.com` 可访问。
- `prisma migrate deploy` 在部署流程中自动执行，schema 与代码一致。
- 红色测试可阻断部署。

## 非目标（本期不做）

- worker / 队列服务（待 AI/定时任务里程碑）。
- pgvector / 语义搜索。
- Loki/Grafana/OpenTelemetry 可观测栈（PRD 日志聚合，独立推进）。
- 蓝绿/多实例零停机迁移。
