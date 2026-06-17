# syntax=docker/dockerfile:1

# ---- builder ----
FROM node:22-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 cmake \
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
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main"]
