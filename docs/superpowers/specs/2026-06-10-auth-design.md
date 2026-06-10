# M1 Auth 模块设计

> 日期：2026-06-10｜状态：已通过 brainstorming 评审，待 writing-plans
> 范围：PRD 3.1 用户系统（注册/登录、JWT、GitHub OAuth、头像上传）
> 相关：[docs/prd.md](../../prd.md) §3.1｜[CLAUDE.md](../../../CLAUDE.md)

## 1. 目标与范围

为博客系统提供工程级认证基础：邮箱密码注册登录、JWT 会话、GitHub OAuth、头像上传到 MinIO。

**M1 范围内**：邮箱注册/登录、access+refresh 双 token（Cookie 承载）、refresh 轮换与复用检测、GitHub OAuth 登录与设置页绑定/解绑、头像预签名直传。

**M1 范围外**（留接口/字段）：邮箱验证（`emailVerifiedAt` 字段预留但不写入、注册即可登录）、纯 GitHub 账号补设密码、邮件发送服务。

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 会话传输 | httpOnly + Secure + SameSite=Lax Cookie，前端 `blog.x` ↔ API `api.blog.x`，CORS + credentials | XSS 偷不到 token；SSR 时 Next 服务端转发 Cookie 即可 |
| 实现方案 | Passport.js + `@nestjs/passport`（`passport-jwt` / `passport-github2` / `@nestjs/jwt`） | 站在官方 Guard/Strategy 体系上，自定义逻辑写 service 层，不手搓 JWT 验签与 OAuth 状态机 |
| 邮箱验证 | M1 不做，`emailVerifiedAt` 留空，注册即可登录 | 个人博客垃圾注册风险低，限流兜底；邮件服务留到 M2 |
| OAuth 邮箱冲突 | 拒绝自动合并，引导密码登录后在设置页手动绑定 | 零接管风险，路径最安全 |
| 头像上传 | 预签名 PUT URL 客户端直传 MinIO，回调确认 | API 不过文件流，负载低 |
| `avatarUrl` 存储 | 存对象 key（相对路径），展示时前端/SSR 拼 base URL | 换 CDN/域名不影响数据 |
| refresh token 存储 | Redis 白名单 + 每次刷新轮换 + 复用检测 | 支持吊销；对齐 PRD §3.1 |

## 3. 模块结构

`apps/api/src/` 下三个职责单一的模块，通过 service 接口通信：

```
auth/
  auth.module.ts
  auth.controller.ts        # register/login/logout/refresh/github 回调
  auth.service.ts           # 注册、登录校验、token 签发/轮换、OAuth 合并决策
  strategies/
    jwt.strategy.ts         # passport-jwt，从 httpOnly Cookie 提取 access token
    jwt-refresh.strategy.ts # 校验 refresh token，比对 Redis 白名单
    github.strategy.ts      # passport-github2，OAuth 回调
  guards/
    jwt-auth.guard.ts
    github-auth.guard.ts
  dto/                      # class-validator：RegisterDto / LoginDto

users/
  users.module.ts
  users.service.ts          # User CRUD、findByEmail/findByGithubId、绑定/解绑 github
  users.controller.ts       # GET /me、PATCH /me、设置页绑定/解绑
  dto/

storage/
  storage.module.ts
  storage.service.ts        # S3 client 封装、签发 presigned PUT URL、校验对象
  storage.controller.ts     # POST /me/avatar/presign、POST /me/avatar/confirm
```

**边界原则**：
- auth 管"你是谁"（凭证签发/校验）；users 管"用户数据"；storage 管对象存储。
- auth 依赖 users 查账号，users 不反向依赖 auth。
- JWT 密钥、Cookie 配置、OAuth client 凭证、S3 凭证全走 `@nestjs/config` 从 `.env` 注入。
- `packages/shared` 增加 auth 共享类型（`AuthUser`、DTO 类型、错误码枚举），前后端共用。

## 4. 数据模型

### 4.1 Prisma schema

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  passwordHash    String?   // 纯 OAuth 用户无密码；密码登录用户才有
  nickname        String
  bio             String?
  avatarUrl       String?   // 存对象 key（相对路径），非完整 URL
  emailVerifiedAt DateTime? // M1 预留，暂不写入
  githubId        String?   @unique // 绑定后才有；冲突时不写
  githubLogin     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([githubId])
}
```

- `passwordHash` 可空：支持纯 GitHub 注册用户。
- `githubId @unique`：一个 GitHub 账号只能绑一个用户；绑定时若已被占用则拒绝。
- 密码用 **argon2id** 哈希，绝不落明文（CLAUDE.md 铁律 1）。

### 4.2 Redis：refresh token

```
key:   refresh:{userId}:{tokenId}
value: <hash of refresh token>
TTL:   7d
```

- access token 15min，无状态不存储；refresh token 7d。
- 每次刷新**轮换**：删旧 tokenId、签发新 tokenId。
- **复用检测**：收到签名有效但 Redis 查不到对应 tokenId 的 refresh（已轮换或已登出）→ 吊销该用户全部 refresh。
- logout = 删除当前 tokenId 的 Redis key。

辅助 Redis key：
```
login_fail:{email}    # 登录失败计数，TTL 15min，达 5 次锁定
oauth_state:{state}   # OAuth CSRF state，短 TTL（如 10min）
```

## 5. 核心流程

### ① 邮箱注册 `POST /auth/register`
```
校验 DTO → email 已存在? 是→409 EMAIL_TAKEN
→ argon2 哈希 → 创建 User(emailVerifiedAt=null)
→ 签发 access+refresh，写 Redis，Set-Cookie ×2 → 200 返回 AuthUser
```

### ② 邮箱登录 `POST /auth/login`
```
findByEmail → 不存在 / 无 passwordHash → 401 INVALID_CREDENTIALS（不区分，防枚举）
→ argon2.verify 失败 → 401（同上）+ 失败计数(login_fail，5 次/15min → 423 ACCOUNT_LOCKED)
→ 成功：清失败计数、签发 token、Set-Cookie → 200
```

### ③ 刷新 `POST /auth/refresh`（JwtRefreshGuard 从 Cookie 取 refresh）
```
JWT 验签：
  ├ exp 已过 → 401 TOKEN_EXPIRED（正常生命周期，不吊销其他会话）
  └ 签名有效 → 查 Redis refresh:{uid}:{tid}：
        命中且 hash 匹配 → 删旧 tid、签发新 access+refresh(新 tid)、写 Redis、Set-Cookie → 200
        查不到（已轮换 / 已登出）→ 吊销该用户全部 refresh → 401 REFRESH_REUSE_DETECTED
```

### ④ 登出 `POST /auth/logout`
```
删 Redis 当前 tid + 清 Cookie → 204
```

### ⑤ GitHub OAuth
```
GET /auth/github          → 重定向 GitHub authorize（带 state，存 oauth_state 防 CSRF）
GET /auth/github/callback → GithubAuthGuard 校验 state、换 token、拉 profile+email
  ├ githubId 已绑定某 User → 直接登录该 User
  ├ githubId 未绑定 + email 未被占用 → 自动建号(passwordHash=null) 并绑定 → 登录
  └ githubId 未绑定 + email 已被占用 → 不合并，302 回前端
       /login?error=EMAIL_TAKEN_BIND_REQUIRED（引导登录后到设置页绑定）
成功分支：Set-Cookie 后 302 回前端
```

### ⑥ 设置页绑定/解绑（需登录，JwtAuthGuard）
```
POST /me/github/bind → 走 OAuth 拿 githubId → 已被别人占 → 409 GITHUB_ALREADY_BOUND
                       否则写入当前 User
DELETE /me/github    → 解绑；若该 User passwordHash=null（纯 GitHub 号）
                       → 409 CANNOT_UNBIND_LAST_METHOD（否则锁死无法登录）
```

### ⑦ 头像上传
```
POST /me/avatar/presign  → 返回 presigned PUT URL + key(avatars/{userId}/{uuid}.webp)
（前端裁剪后直传 MinIO）
POST /me/avatar/confirm {key}
  → storageService 校验：key 前缀属于本人 & 对象存在 & ≤2MB & MIME 合法
     不通过 → 400 INVALID_UPLOAD
  → 写 User.avatarUrl = key（相对路径）→ 200
```

## 6. 错误处理与安全

### 6.1 统一错误结构

全局 `ExceptionFilter` 把所有异常归一成 `{ code, message, traceId }`（CLAUDE.md 铁律 9），`traceId` 取自请求上下文（对齐 PRD 可观测性）。错误码枚举放 `packages/shared`，前后端共用。

| code | HTTP | 场景 | 备注 |
|------|------|------|------|
| `VALIDATION_ERROR` | 400 | DTO 校验失败 | |
| `EMAIL_TAKEN` | 409 | 注册邮箱已存在 | |
| `INVALID_CREDENTIALS` | 401 | 登录账号/密码错 | 不区分，防枚举 |
| `ACCOUNT_LOCKED` | 423 | 失败 5 次锁定 15min | 响应带 `Retry-After`（剩余锁定秒数） |
| `RATE_LIMITED` | 429 | 限流触发 | 响应带 `Retry-After` |
| `TOKEN_EXPIRED` | 401 | access/refresh 正常过期 | 不吊销其他会话 |
| `TOKEN_INVALID` | 401 | token 签名/格式非法 | |
| `REFRESH_REUSE_DETECTED` | 401 | refresh 复用（已轮换/已登出），已全量吊销 | |
| `EMAIL_TAKEN_BIND_REQUIRED` | —（302） | OAuth 邮箱冲突，重定向前端 | 非 JSON |
| `GITHUB_ALREADY_BOUND` | 409 | 该 GitHub 已绑定他人 | |
| `CANNOT_UNBIND_LAST_METHOD` | 409 | 纯 GitHub 号解绑会锁死 | |
| `INVALID_UPLOAD` | 400 | 头像 key 非法/对象不存在/超限 | |

### 6.2 安全清单

- **Cookie**：`httpOnly + Secure + SameSite=Lax`；access/refresh 分两个 Cookie。access `Path=/`；refresh `Path=/auth` 收窄到 auth 命名空间——既能被 `/auth/refresh` 也能被 `/auth/logout`（登出需读 refresh 以吊销会话）接收，且永不发往 `/me` 等应用路由。（注：初版设计为 `/auth/refresh`，但那样登出收不到 refresh cookie，集成测试已暴露并修正。）
- **CSRF**：SameSite=Lax 挡跨站；状态变更走 POST；OAuth 用 `state` + Redis 校验。
- **CORS**：仅白名单前端域 + `credentials: true`。
- **限流**：`@nestjs/throttler`，登录/注册严格限流（IP + email 维度），presign 限流防刷。
- **密码**：argon2id；登录响应不泄露账号是否存在。
- **JWT**：access 15min；refresh 轮换 + 复用检测；密钥从 env 注入。
- **日志**：pino 记录 auth 事件（登录成功/失败、绑定、吊销），绝不记录密码、token、哈希（铁律 5）。
- **输入**：所有 DTO 用 class-validator，全局 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`，校验失败映射为 `VALIDATION_ERROR`。

## 7. 测试策略

Nest 11 自带 Jest。对齐 CLAUDE.md 铁律 6（P0 功能必带测试，修 bug 先写复现测试）。

### 7.1 单元测试（service 层，mock 依赖）
- `auth.service`：注册去重、argon2 哈希调用、登录成功/失败、失败计数锁定、refresh 轮换、复用检测全量吊销、OAuth 三分支决策。
- `users.service`：findByEmail/findByGithubId、绑定时 githubId 占用拒绝、解绑「最后登录方式」拒绝。
- `storage.service`：presign key 生成规则、confirm 时 key 前缀归属校验、对象不存在/超限拒绝。

### 7.2 集成测试（`supertest`，Postgres + Redis 用 CI service containers）
- **全链路**：注册 → 登录 → 访问 `/me` → 刷新 → 登出；登出后旧 refresh 失效。
- **refresh 复用三场景**（断言不同）：
  - 已轮换旧 token → 全量吊销 + 401 `REFRESH_REUSE_DETECTED`
  - 已登出 token → 全量吊销 + 401 `REFRESH_REUSE_DETECTED`
  - 已过期 token → 401 `TOKEN_EXPIRED`，且其他会话不受影响（不吊销）
- **OAuth 回调三分支**（GitHub API 用 mock/nock 桩）：已绑定登录、新建绑定、邮箱冲突重定向 `EMAIL_TAKEN_BIND_REQUIRED`。
- **头像上传链路**：presign 生成 → confirm 写入 `avatarUrl`；key 前缀不符 / 对象不存在 / 超限 → 400 `INVALID_UPLOAD`。
- **限流/锁定**：超阈值 → 429 `RATE_LIMITED`（带 `Retry-After`）；登录失败 5 次 → 423 `ACCOUNT_LOCKED`（带 `Retry-After`）。
- **Cookie 属性断言**：httpOnly / Secure / SameSite / Path 正确。

### 7.3 测试数据
每个用例独立建库/清库（事务回滚或 truncate），不依赖执行顺序。CI 走 GitHub Actions service containers。

### 7.4 验收出口
`pnpm verify` 全绿（lint + typecheck + 上述测试），覆盖 auth/users/storage 三模块核心分支。
