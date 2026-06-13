# 前端认证体验补齐 — 进度

> 更新：2026-06-13 ｜ 分支：`feat/auth-frontend-polish`（未合并）
> 设计：`docs/superpowers/specs/2026-06-13-auth-frontend-polish-design.md`
> 计划：`docs/superpowers/plans/2026-06-13-auth-frontend-polish.md`（9 个 task）

## 状态总览

- **Task 1–7：✅ 完成并验证**（subagent 实现 + controller 端审：diff + gate）
- **Task 8（MinIO）：✅ 完成** —— bucket 匿名读 + CORS 已验证（见下「MinIO 运行时配置」）。
- **Task 9（全量校验 + 手动核对）：✅ 自动门禁全过 + 服务端可观测项已 API 验证；纯视觉项待人工浏览器确认。**

### Task 9 验证结果
自动门禁：`@blog/web` typecheck clean / lint 0 errors（1 个既有 img warning）/ `next build` 成功（/login /register /settings 成路由）；`pnpm verify` 8/8。

API 已验证（curl）：注册自动登录（201+cookie+/me）、登录错误码 `INVALID_CREDENTIALS`、`PATCH /me` 持久化、GitHub 解绑 200、登出 204；头像链路 Task 8 已端到端跑通（presign→PUT→confirm→匿名 GET 全 200）。

**待人工浏览器确认（纯视觉/交互，无法脚本化）：** 右上角头像框渲染 + 下拉菜单、登出后头部恢复「登录」、`/login?error=...` 中文回显、已登录访问 /login·/register 自动跳首页、设置页选图上传后头像即时刷新、唯一登录方式解绑的中文拦截。代码层面均已实现并通过 build。

## MinIO 运行时配置（dev，clone 后需手动执行一次）

`avatarUrl` 存的是对象 key，bucket 默认私有 → 头像会 403。开发环境执行一次：
```bash
docker exec blog-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec blog-minio mc mb --ignore-existing local/blog   # 若桶不存在
docker exec blog-minio mc anonymous set download local/blog # 头像匿名可读
```
验证（Task 8 已跑通）：匿名 GET 返回 200；CORS 预检 `OPTIONS`（Origin localhost:3000 / PUT）返回 204 带 `Access-Control-Allow-Origin: http://localhost:3000` —— **MinIO 默认 S3 CORS 已放行浏览器直传，无需改 compose**。生产应改用 CDN/公开桶或后端签名 GET。

## 验证门禁（Task 1–7 结束时）
- `pnpm --filter @blog/web typecheck`：clean
- `pnpm --filter @blog/web lint`：0 errors（1 个既有 `no-img-element` warning，来自 Avatar 的 `<img>`，符合计划预期）
- `pnpm --filter @blog/web build`：成功，`/login`、`/register`、`/settings` 均已成路由
- `pnpm verify`（全仓）：8/8

## 已完成提交（`3d12a0b..` 之后，8 文件 +547/−14）
| SHA | 内容 |
|-----|------|
| `50a247a` | feat(web): auth error code → 中文 映射 |
| `2be1b57` | feat(web): avatar src 解析 + webp 转换 + 上传流程 |
| `0be3974` | feat(web): Avatar 组件（首字母占位） |
| `8893c8d` | feat(web): 头部用户菜单（登录链接 / 头像下拉 + 登出） |
| `75cac37` | feat(web): 登录页升级（校验/中文错误/?error=/注册链接/已登录重定向） |
| `a0c810e` | feat(web): 注册页（客户端校验 + GitHub 入口） |
| `e0f3671` | feat(web): 设置页（头像上传 / 资料编辑 / GitHub 解绑） |

## 实现期记录
- 登录页 OAuth `?error=` 的 setState、设置页 seed `useEffect` 触发 `react-hooks/set-state-in-effect`：分别用 eslint-disable / `startTransition` 处理（后者匹配 `auth-context` 既有写法）。
- Avatar 用裸 `<img>`（非 next/image，因头像来自 MinIO 运行时）→ 1 个 lint warning，符合计划 NOTE。
- 所有现有文件编辑均为纯增量（layout 加 2 行）。

## 剩余 Task（恢复时做）

### Task 8：MinIO 头像可读 + 直传 CORS + 公开基址 env（基础设施，controller 直接做）
⚠️ 关键背景：`avatarUrl` 存的是对象 key（非 URL），bucket 当前私有（匿名 GET 403），`mc` 不在宿主机 → 用 `docker exec blog-minio mc`。
1. `docker exec blog-minio mc alias set local http://localhost:9000 minioadmin minioadmin`
2. `docker exec blog-minio mc anonymous set download local/blog`
3. 验证匿名读：放测试对象 → `curl http://localhost:9000/blog/avatars/_probe.txt` 期望 200 → 删除。
4. 验证直传 CORS 预检：`curl -i -X OPTIONS http://localhost:9000/blog/avatars/x.webp -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: PUT"` → 找 `Access-Control-Allow-Origin`。若无 → 在 compose 的 minio.environment 加 `MINIO_API_CORS_ALLOW_ORIGIN: "http://localhost:3000"` 后 `docker compose up -d minio` 重试。
5. `.env.example` 加 `NEXT_PUBLIC_S3_PUBLIC_URL=http://localhost:9000/blog`（avatar.ts 已有同值默认回退）。
6. 提交受版本控制的文件（.env.example / 可能的 docker-compose.yml）；mc 匿名读策略是运行时状态，记到 docs/部署说明。

### Task 9：收口
- `pnpm --filter @blog/web` typecheck + lint + build；`pnpm verify` 全绿。
- 手动核对清单（见计划 Task 9 Step 3）：注册→自动登录→右上角头像；登出；登录错误中文；`/login?error=...`；已登录访问 /login/register 跳首页；**头像上传即时刷新（验证 Task 8）**；改昵称/简介持久化；GitHub 解绑；唯一登录方式解绑被中文拦截。

恢复后：Task 8 → Task 9 → `superpowers:finishing-a-development-branch`（合并/PR）。注意头像上传的端到端验证依赖 Task 8 完成。
