# M8 Deployment Implementation Plan

> **⚠️ 部分取代（2026-06-17）：无自有域名 + 全程不绑卡。** 最终托管栈改为 **Vercel(web) + Koyeb(api) + Supabase(Postgres+存储) + Upstash(Redis)**，认证 Cookie 改 `SameSite=None`。以 spec 的「修订二」为准：`docs/superpowers/specs/2026-06-16-m8-deployment-design.md`。
> - **代码任务（已完成）**：Task 1 `/health`、Task 2 Dockerfile、Task 3 `.env.example`、Task 4 CI deploy（已改 Koyeb），外加：跨站 Cookie、S3 region 可配、迁移随容器启动。
> - **下文 Task 5（Cloudflare R2）→ 改为 Supabase Storage + Upstash**；**Task 6（Railway）→ 改为 Koyeb + Supabase Postgres**；**Task 7（Vercel）基本不变**，仅域名用 `*.vercel.app`、API URL 用 `*.koyeb.app`；**Task 5 的 DNS/自定义域全部跳过**。具体手动步骤以对话/修订二为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `apps/web` to Vercel and `apps/api` to Railway, with Postgres + Redis managed on Railway and image storage on Cloudflare R2, all under one custom domain so auth cookies stay first-party, with deploys gated on green CI.

**Architecture:** web (apex `<DOMAIN>`) on Vercel, api (`api.<DOMAIN>`) on Railway, both under the same registrable domain so `SameSite=Lax` cookies work unchanged (`COOKIE_DOMAIN=.<DOMAIN>`). Images upload via presigned PUT directly to an R2 bucket and serve from a public `cdn.<DOMAIN>` custom domain. GitHub Actions runs verify + e2e, and only on green does it trigger both platform deploys. Prisma migrations run as a Railway pre-deploy command.

**Tech Stack:** Next.js (Vercel), NestJS + Prisma (Railway, Docker), Railway managed Postgres 16 + Redis, Cloudflare DNS + R2, GitHub Actions.

> **IMPORTANT — substitute the real domain.** Throughout this plan, replace `<DOMAIN>` with your actual registrable domain (e.g. `myblog.dev`). `<ACCOUNT_ID>` is your Cloudflare R2 account id.

**Reference spec:** `docs/superpowers/specs/2026-06-16-m8-deployment-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `apps/api/src/app.controller.ts` | add `GET /health` returning `{ status: 'ok' }` | Modify |
| `apps/api/src/app.service.ts` | provide health payload | Modify |
| `apps/api/src/app.controller.spec.ts` | unit-test health handler | Modify |
| `apps/api/test/app.e2e-spec.ts` | e2e-test `/health` route | Modify |
| `apps/api/Dockerfile` | multi-stage build for Railway (native deps + prisma kept) | Create |
| `apps/api/.dockerignore` | keep build context small | Create |
| `.env.example` | document prod-shaped variables | Modify |
| `.github/workflows/ci.yml` | gated `deploy` job after verify + e2e | Modify |

Tasks 1–4 are code (TDD where applicable). Tasks 5–9 are platform provisioning (manual dashboard/CLI actions with explicit verification — no code, so no TDD).

---

## Task 1: Add `GET /health` endpoint

**Files:**
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.controller.ts`
- Test (unit): `apps/api/src/app.controller.spec.ts`
- Test (e2e): `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Write the failing unit test**

In `apps/api/src/app.controller.spec.ts`, add inside the top-level `describe('AppController', …)` block (after the existing `describe('root', …)` block):

```typescript
  describe('health', () => {
    it('returns ok status', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });
  });
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `pnpm --filter @blog/api exec jest app.controller.spec.ts -t health`
Expected: FAIL — `appController.getHealth is not a function`.

- [ ] **Step 3: Implement the service method**

In `apps/api/src/app.service.ts`, add a method to the `AppService` class:

```typescript
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
```

- [ ] **Step 4: Implement the controller route**

Replace the contents of `apps/api/src/app.controller.ts` with:

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): { status: 'ok' } {
    return this.appService.getHealth();
  }
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `pnpm --filter @blog/api exec jest app.controller.spec.ts`
Expected: PASS (both `root` and `health`).

- [ ] **Step 6: Add the e2e test**

In `apps/api/test/app.e2e-spec.ts`, add a new test inside the `describe('AppController (e2e)', …)` block (after the existing `/ (GET)` test):

```typescript
  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `pnpm --filter @blog/api test:e2e -- app.e2e-spec.ts`
Expected: PASS. (Requires local Postgres + Redis up via `docker compose up -d postgres redis`.)

- [ ] **Step 8: Run verify to confirm nothing else broke**

Run: `pnpm verify`
Expected: lint + typecheck + test all green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/app.controller.ts apps/api/src/app.service.ts apps/api/src/app.controller.spec.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): add GET /health endpoint for platform health checks"
```

---

## Task 2: API Dockerfile + .dockerignore

**Files:**
- Create: `apps/api/.dockerignore`
- Create: `apps/api/Dockerfile`

Context notes baked into the Dockerfile: native deps (`nodejieba`, `argon2`) need `python3 make g++` at build; Prisma needs `openssl` at runtime and we keep the `prisma` CLI + schema in the image so the Railway pre-deploy step can run `prisma migrate deploy`; `corepack` provides the pinned pnpm. The build context is the **repo root** (the workspace), not `apps/api`.

- [ ] **Step 1: Create `apps/api/.dockerignore`**

```
**/node_modules
**/dist
**/.next
**/.turbo
**/coverage
.git
**/*.log
.env
.env.*
```

- [ ] **Step 2: Create `apps/api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# ---- builder ----
FROM node:22-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
WORKDIR /app

# Manifests first for better layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Full install (native modules compile here; approvals come from root package.json)
RUN pnpm install --frozen-lockfile

# Source
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @blog/shared build \
    && pnpm --filter @blog/api exec prisma generate \
    && pnpm --filter @blog/api build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
ENV NODE_ENV=production
WORKDIR /app

# Bring the whole built workspace (keeps prisma CLI + schema for migrate deploy,
# plus the compiled native addons and the built dist/ output).
COPY --from=builder /app /app

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main"]
```

- [ ] **Step 3: Build the image locally to verify it compiles**

Run (from repo root): `docker build -f apps/api/Dockerfile -t blog-api:test .`
Expected: build completes; final stage produces `blog-api:test`. Watch for native-module build failures (would indicate a missing apt package in the builder).

- [ ] **Step 4: Smoke-run the image against local infra**

With `docker compose up -d postgres redis minio` running, run:

```bash
docker run --rm -p 3001:3001 --env-file .env -e DATABASE_URL=postgresql://blog:blog@host.docker.internal:5432/blog -e REDIS_URL=redis://host.docker.internal:6379 -e S3_ENDPOINT=http://host.docker.internal:9000 blog-api:test
```

Then in another shell: `curl -fsS http://localhost:3001/health`
Expected: `{"status":"ok"}`. Stop the container with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore
git commit -m "build(api): add multi-stage Dockerfile for Railway deploy"
```

---

## Task 3: Document prod environment variables in `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append a production section to `.env.example`**

Add the following block at the end of `.env.example` (keep the existing dev values above it untouched):

```bash

# ──────────────────────────────────────────────────────────────
# 生产环境形态（实际值配置在 Railway / Vercel 控制台，不入库）
# 详见 docs/superpowers/specs/2026-06-16-m8-deployment-design.md
# ──────────────────────────────────────────────────────────────
# Railway(api):
#   DATABASE_URL=${{Postgres.DATABASE_URL}}
#   REDIS_URL=${{Redis.REDIS_URL}}
#   NODE_ENV=production
#   TRUST_PROXY=1
#   WEB_ORIGIN=https://<DOMAIN>
#   COOKIE_DOMAIN=.<DOMAIN>
#   GITHUB_CALLBACK_URL=https://api.<DOMAIN>/auth/github/callback
#   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#   S3_ACCESS_KEY / S3_SECRET_KEY = R2 API token
#   S3_BUCKET=blog-prod
# Vercel(web) 构建期：
#   NEXT_PUBLIC_API_URL=https://api.<DOMAIN>
#   NEXT_PUBLIC_S3_PUBLIC_URL=https://cdn.<DOMAIN>
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document production env var shape in .env.example"
```

---

## Task 4: Gated `deploy` job in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

The `deploy` job runs only on push to `main` and only after both `verify` and `e2e` succeed. It triggers Vercel via a deploy hook (built with Vercel dashboard settings) and Railway via the Railway CLI (`railway up`, which uploads the checkout and builds with our Dockerfile). Railway's pre-deploy command (configured in Task 6) runs `prisma migrate deploy`.

- [ ] **Step 1: Add the `deploy` job**

Append this job to `.github/workflows/ci.yml` (at the same indentation level as the existing `verify` and `e2e` jobs, under `jobs:`):

```yaml
  deploy:
    needs: [verify, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Trigger Vercel production deploy
        run: curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL"
        env:
          VERCEL_DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Railway CLI
        run: npm i -g @railway/cli

      - name: Deploy API to Railway
        run: railway up --service api --environment production --ci
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

- [ ] **Step 2: Validate the workflow YAML locally**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"`
Expected: prints `ok` (no YAML syntax error). The `deploy` job will no-op until the two secrets exist (added in Tasks 6–7) and is skipped entirely on PRs.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add gated deploy job (Vercel hook + Railway CLI) after verify+e2e"
```

> Do NOT push to `main` yet — pushing triggers a deploy. Hold until Tasks 5–8 provisioning is done. If working on a branch, this is safe to push as a PR (the `deploy` job is skipped on PRs).

---

## Task 5: Cloudflare DNS + R2 bucket (manual)

**Files:** none (Cloudflare dashboard).

- [ ] **Step 1: Move DNS to Cloudflare**

Add `<DOMAIN>` as a site in Cloudflare and update the registrar's nameservers to Cloudflare's. Wait for the zone to show "Active".
Verify: `dig NS <DOMAIN> +short` lists Cloudflare nameservers.

- [ ] **Step 2: Create the R2 bucket**

In R2, create a bucket named `blog-prod`. Note your account id (shown in the S3 API endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

- [ ] **Step 3: Create an R2 API token**

Create an R2 API token scoped to `blog-prod` with **Object Read & Write**. Save the Access Key ID and Secret Access Key (used as `S3_ACCESS_KEY` / `S3_SECRET_KEY`).

- [ ] **Step 4: Attach the public custom domain**

In the bucket's Settings → Public access → Custom Domains, add `cdn.<DOMAIN>`. Cloudflare creates the DNS record automatically. Wait until it shows active.
Verify: after Task 9 uploads exist; for now confirm the domain status is "Active".

- [ ] **Step 5: Set the bucket CORS policy**

In the bucket Settings → CORS Policy, add (browser uploads via presigned PUT come from the web origin):

```json
[
  {
    "AllowedOrigins": ["https://<DOMAIN>"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Verify: the policy saves without error.

---

## Task 6: Railway project provisioning (manual)

**Files:** none (Railway dashboard + GitHub repo settings).

- [ ] **Step 1: Create project and databases**

Create a Railway project `blog-prod`. Add a **Postgres** plugin and a **Redis** plugin.

- [ ] **Step 2: Create the api service from the repo**

Add a new service from the GitHub repo. Set:
- **Root Directory:** `/` (repo root — the Docker build context).
- **Builder:** Dockerfile, path `apps/api/Dockerfile`.
- **Watch Paths:** `apps/api/**`, `packages/shared/**` (avoid rebuilds on web-only changes).

- [ ] **Step 3: Disable auto-deploy on push**

In the api service → Settings → turn **off** "Deploy on push" (deploys are driven by the gated CI job via `railway up`). Leave the GitHub repo connected for `railway up` uploads.

- [ ] **Step 4: Set the pre-deploy command**

In the api service → Settings → Deploy → **Pre-Deploy Command**:

```
pnpm --filter @blog/api exec prisma migrate deploy
```

This runs against the built image before the new container takes traffic.

- [ ] **Step 5: Set environment variables**

In the api service → Variables, add:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NODE_ENV=production
TRUST_PROXY=1
WEB_ORIGIN=https://<DOMAIN>
COOKIE_DOMAIN=.<DOMAIN>
JWT_ACCESS_SECRET=<32+ char random>
JWT_REFRESH_SECRET=<32+ char random, different>
GITHUB_CLIENT_ID=<from Task 8>
GITHUB_CLIENT_SECRET=<from Task 8>
GITHUB_CALLBACK_URL=https://api.<DOMAIN>/auth/github/callback
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<R2 access key>
S3_SECRET_KEY=<R2 secret key>
S3_BUCKET=blog-prod
```

Generate secrets with: `openssl rand -base64 48`. (`PORT` is injected by Railway automatically — do not set it.)

- [ ] **Step 6: Configure the health check + domain**

- Settings → Healthcheck Path: `/health`.
- Settings → Networking → add Custom Domain `api.<DOMAIN>`; create the shown CNAME in Cloudflare DNS (set to **DNS only / grey-cloud** so Railway terminates TLS). Wait until Railway shows the domain verified.

- [ ] **Step 7: Enable daily database backups**

In the Postgres plugin → Backups, enable scheduled daily backups (PRD availability requirement).

- [ ] **Step 8: Create a Railway project token and add it to GitHub**

Project Settings → Tokens → create a token scoped to the `production` environment. In the GitHub repo → Settings → Secrets and variables → Actions, add secret `RAILWAY_TOKEN` with that value.

---

## Task 7: Vercel project provisioning (manual)

**Files:** none (Vercel dashboard + GitHub repo settings).

- [ ] **Step 1: Import the repo**

In Vercel, import the GitHub repo. Set **Root Directory** to `apps/web`. Vercel auto-detects Next.js and pnpm workspaces.

- [ ] **Step 2: Set the build command**

Override the Build Command to ensure `@blog/shared` builds first:

```
cd ../.. && pnpm turbo build --filter=@blog/web
```

Leave Output Directory as the default (`apps/web/.next`).

- [ ] **Step 3: Set build-time env vars (Production scope)**

Project Settings → Environment Variables (Production):

```
NEXT_PUBLIC_API_URL=https://api.<DOMAIN>
NEXT_PUBLIC_S3_PUBLIC_URL=https://cdn.<DOMAIN>
```

- [ ] **Step 4: Add domains with apex as canonical**

Project Settings → Domains: add `<DOMAIN>` (primary) and `www.<DOMAIN>` configured to **redirect to** `<DOMAIN>`. Create the DNS records Vercel shows in Cloudflare (proxy/orange-cloud is fine for Vercel).

- [ ] **Step 5: Disable Git auto-deploy**

Project Settings → Git → turn **off** automatic production deployments on push (deploys are driven by the gated CI job via the deploy hook).

- [ ] **Step 6: Create a Deploy Hook and add it to GitHub**

Project Settings → Git → Deploy Hooks → create one for branch `main`. Copy the URL. In the GitHub repo → Actions secrets, add `VERCEL_DEPLOY_HOOK_URL` with that URL.

---

## Task 8: Production GitHub OAuth app (manual)

**Files:** none (GitHub developer settings).

- [ ] **Step 1: Register the OAuth app**

GitHub → Settings → Developer settings → OAuth Apps → New. Set:
- Homepage URL: `https://<DOMAIN>`
- Authorization callback URL: `https://api.<DOMAIN>/auth/github/callback`

- [ ] **Step 2: Wire credentials into Railway**

Copy the Client ID and generate a Client Secret. Set them as `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in the Railway api service (Task 6 Step 5).

---

## Task 9: First deploy + end-to-end smoke test

**Files:** none (merge + verification).

- [ ] **Step 1: Trigger the first deploy**

Merge the branch with Tasks 1–4 into `main` (or push to `main`). Confirm GitHub Actions runs `verify` → `e2e` → `deploy`, and `deploy` succeeds (Vercel hook 200, `railway up` completes, Railway pre-deploy runs `prisma migrate deploy`).

- [ ] **Step 2: Verify API health and migrations**

Run: `curl -fsS https://api.<DOMAIN>/health`
Expected: `{"status":"ok"}`. Check the Railway deploy logs show `prisma migrate deploy` applied all migrations (or "No pending migrations").

- [ ] **Step 3: Verify the web app loads**

Open `https://<DOMAIN>` in a browser. Confirm the page renders and that `www.<DOMAIN>` 301-redirects to the apex.

- [ ] **Step 4: Verify auth (cross-subdomain cookies)**

Register or log in on `https://<DOMAIN>`. In DevTools → Application → Cookies, confirm `access_token` / `refresh_token` are set with `Domain=.<DOMAIN>`, `Secure`, `HttpOnly`, `SameSite=Lax`. Reload and confirm you stay logged in (refresh flow works). Test the GitHub OAuth login button end-to-end.

- [ ] **Step 5: Verify image upload + serving (R2)**

In the editor, paste/drop an image. Confirm the presigned PUT to R2 succeeds (no CORS error in console) and the image renders from `https://cdn.<DOMAIN>/...`.

- [ ] **Step 6: Verify the deploy gate**

Open a PR with a deliberately failing test. Confirm the `deploy` job does **not** run (it requires `verify`+`e2e` green and is push-to-main only). Revert the failing test.

---

## Notes for the implementer

- Tasks 1–4 are ordinary code changes; do them first and keep them on a branch — they are safe to PR because the `deploy` job is push-to-`main` only.
- Tasks 5–8 are one-time manual provisioning and have no automated tests; their verification steps are the acceptance checks.
- Do not push Task 4 to `main` until provisioning (5–8) is complete, or the first `deploy` will fire against unconfigured platforms.
- No application logic changes to `cookies.ts`, CORS, or `storage.service.ts` — the design relies on env config only.
