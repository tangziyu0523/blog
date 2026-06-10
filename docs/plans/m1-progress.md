# M1 Auth — 执行进度

> 更新：2026-06-10｜分支：`feat/m1-auth`｜计划：[../superpowers/plans/2026-06-10-m1-auth.md](../superpowers/plans/2026-06-10-m1-auth.md)
> 状态：**17/22 任务完成，`pnpm verify` 全绿**；T18–T22 阻塞于 Docker 未启动。

## ✅ 已完成（T1–T17，均已提交）

| 任务 | 内容 | commit |
|------|------|--------|
| T1 | auth 依赖 + strict tsconfig | `05a2597` |
| T2 | zod 环境校验 + 全局 ConfigModule | `d10fa07` |
| —  | Prisma 锁定 v6 + 原生构建放行（argon2/prisma） | `7bcd8a8` |
| T3 | Prisma User 模型 + 离线 baseline 迁移（**未应用到真库**） | `03f9f23` |
| T4 | Redis 模块（ioredis） | `276ea80` |
| T5 | shared `ErrorCode`（const-object）+ `AuthUser` | `bc264ec` → `fcbc163` |
| T6 | `AppError` + 全局异常过滤器 + main.ts（CORS/ValidationPipe/cookie-parser） | `f07e329` |
| T7 | UsersService（CRUD + github 绑定/解绑规则） | `30c65be` |
| T8 | PasswordService（argon2id） | `c86dcff` |
| T9 | TokenService（JWT + Redis 轮换 + 复用检测） | `d3f6312` |
| T10 | AuthService register/login + 锁定计数 | `7f762f6` |
| T11 | jwt/refresh 策略 + 守卫（**含 handleRequest 错误映射，即 T19 的最终版**）+ cookie 助手 | `8affd17` |
| T12 | DTO + AuthController + UsersController + AuthModule | `fd75fcb` |
| T13 | OAuth 三分支决策 `handleGithubLogin` | `4c1bb59` |
| T14 | GitHub 策略 + OAuth 路由（Redis state）+ unbind | `93c65cd` |
| T15 | StorageService（presign + confirm 校验） | `23cee30` |
| T16 | 头像 presign/confirm 接口 + StorageModule | `de3b3ba` |
| T17 | 全局 ThrottlerModule + auth 路由限流 | `2041470` |
| —  | 全模块 ESLint 清理（2 处源码 + spec 文件规则放行） | `e56f17b` |

**校验状态**：`pnpm verify` = 8/8 全绿（lint + typecheck + test，单测约 36 个全过）。

## ⏸ 进行中

无。上一个被中断的 T14 实际已由子代理提交完成（`93c65cd`），已确认 typecheck/test 通过。

## ⛔ 未开始（T18–T22）— 阻塞于 Docker

这 5 个任务是**集成测试 + CI**，需要真实的 Postgres + Redis（+ MinIO），但 Docker daemon 当前未启动（整个会话多次 `open -a Docker` 均未拉起）。

| 任务 | 内容 |
|------|------|
| T18 | e2e 脚手架（`test/setup.ts`、`test/jest-e2e.json`）+ 注册/登录/refresh/logout 全链路 |
| T19 | e2e refresh 复用三场景（已轮换/已登出→`REFRESH_REUSE_DETECTED`；已过期→`TOKEN_EXPIRED` 不吊销）。**守卫已在 T11 写好，本任务只加测试** |
| T20 | e2e GitHub OAuth 三分支（nock 打桩） |
| T21 | e2e 头像上传 + 账号锁定/限流 |
| T22 | CI 增加 e2e job（Postgres/Redis service containers）+ 最终 `pnpm verify` |

## ▶ 下一步精确指令（恢复执行）

**前置：启动 Docker，并把离线迁移应用到测试库。**

```bash
# 1. 启动 Docker Desktop（手动打开 App，等待 daemon 就绪）
docker info        # 确认返回正常

# 2. 拉起依赖服务
cd /Users/tangziyu/blog
docker compose up -d postgres redis minio

# 3. 把 T3 的离线迁移应用到测试库（e2e 用独立库 blog_test）
cd apps/api
DATABASE_URL=postgresql://blog:blog@localhost:5432/blog_test pnpm exec prisma migrate deploy
```

**然后按计划执行 T18→T22**（见 plan 文件对应任务，含完整代码与命令）。注意事项：
- 继续用 **subagent-driven-development**，逐任务派子代理。
- ⚠️ **给每个子代理的验证步骤里务必加上 `pnpm --filter @blog/api lint`**（之前 T1–T17 的子代理只跑了 typecheck+test，导致 lint 错误累积，已在 `e56f17b` 统一修掉；勿重蹈）。
- T19 的实现说明里关于「修改守卫 handleRequest」的步骤**可跳过**——守卫最终版已在 T11 (`8affd17`) 完成，本任务只需新增 `test/refresh-reuse.e2e-spec.ts`。
- e2e 运行命令模板：
  ```bash
  cd apps/api && DATABASE_URL=postgresql://blog:blog@localhost:5432/blog_test pnpm exec jest --config test/jest-e2e.json test/<spec>.ts
  ```
- 全部完成后跑根目录 `pnpm verify` 必须全绿，再走 `finishing-a-development-branch`（合并/PR）。

## 关键环境事实（勿忘）

- **Prisma 锁定 6.19.3**（v7 generator 破坏性变更与计划不兼容）。
- `class-validator` / `class-transformer` 已在 T12 补装。
- 根 `package.json` 的 `pnpm.onlyBuiltDependencies` 已放行 `argon2`/`prisma`/`@prisma/client`/`@prisma/engines`。
- e2e jest 配置（`test/jest-e2e.json`）需把 `@blog/shared` 映射到源码（见 plan T18）。
- `apps/api/.env` 为本地文件（gitignored），含 `DATABASE_URL` 等；CI 用 env 变量注入（见 plan T22）。
