# CLAUDE.md — 技术铁律

工程级个人博客系统。需求见 `docs/prd.md`。

## 技术栈（已定，不重新选型）

| 层 | 选型 |
|----|------|
| Monorepo | pnpm workspace + Turborepo |
| 前端 | Next.js (App Router) + Tailwind CSS，目录 `apps/web` |
| 后端 | NestJS，目录 `apps/api` |
| 数据库 | PostgreSQL 16（FTS + pgvector），ORM 用 Prisma |
| 缓存/队列 | Redis + BullMQ |
| 对象存储 | S3 兼容（开发 MinIO） |
| 日志 | pino 结构化 JSON，禁止 console.log 进生产代码 |
| 部署 | Docker Compose；CI 用 GitHub Actions |

## 常用命令

```bash
pnpm dev        # 本地开发（turbo）
pnpm verify     # lint + typecheck + test —— Stop hook 守门用，必须全绿
pnpm build      # 全量构建
```

## 铁律

1. **TypeScript strict 模式，禁止 `any`**；公共类型放 `packages/shared`，前后端不许各写一份。
2. **任何任务结束前 `pnpm verify` 必须通过**——Stop hook 会强制检查，不许绕过、不许改 hook 放水。
3. **数据库改动只走 Prisma migration**，禁止手改库；migration 文件进 git。
4. **API 一律参数校验**（zod/class-validator），用户输入默认不可信；SQL 只用参数化。
5. **密钥只放 `.env`（已 gitignore）**，提供 `.env.example`；任何密钥不进代码、不进日志。
6. **每个 P0 功能必须带测试**：API 接口测试 + 核心逻辑单测；修 bug 先写复现测试。
7. **不引入新基础设施组件**（ES、Kafka、k8s 等）除非 PRD 决策更新；优先用 Postgres/Redis 解决。
8. **提交规范**：Conventional Commits（`feat:` `fix:` `chore:` …），一个提交一件事。
9. **错误处理**：API 统一错误结构 `{ code, message, traceId }`；不吞异常，不裸 catch 空块。
10. **AI 生成的内容必须标注且可人工编辑**；LLM 调用全部走统一网关层（记录 token 用量）。

## 工作流

- 新功能先看 `docs/prd.md` 对应章节确认验收标准，再动手。
- 按里程碑推进：P0 没完成不碰 P1/P2。
- 大改动先出简短方案（涉及 schema/架构时），小改动直接做。
