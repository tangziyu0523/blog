# M4b 订阅与通知 — 进度

> 更新：2026-06-12 ｜ 分支：`feat/m4b-notifications`（未合并）
> 设计：`docs/superpowers/specs/2026-06-12-m4b-subscriptions-notifications-design.md`
> 计划：`docs/superpowers/plans/2026-06-12-m4b-subscriptions-notifications.md`（13 个 task）

## 状态总览

- **Task 1–5：✅ 完成并验证**（只做新建/纯增量，不碰现有 feature 代码）
- **Task 6–13：⬜ 未开始**（Task 6 起开始改现有文件：app.module、comments、posts、layout、post 页）

执行方式：subagent-driven 实现 + controller 端自审（省额度，未派评审 subagent）。Task 2（migration）由 controller 直接做（避免重蹈 M4a 的 search_vector 漂移）。

## 验证门禁（本批结束时）
- `pnpm verify`：**8/8 通过**。
- 迁移后 search e2e：**7/7**（search_vector 完好）。
- `prisma migrate status`：5 个迁移，schema up to date，无 pending、无 stray 迁移。

## 已完成提交（`bfc9326..` 之后）
| SHA | 内容 |
|-----|------|
| `778e1d4` | feat(shared): 通知类型 + follow/notification 错误码 |
| `37b2233` | feat(api): Follow & Notification schema + migration + resetDb |
| `c4ac798` | feat(api): NotificationStreamService（进程内 SSE 扇出） |
| `e1af937` | feat(api): FollowsService（关注切换/状态/关注者）5/5 单测 |
| `691e378` | feat(api): NotificationsService（emit/list/read + 评论&发文规则）7/7 单测 |

## 关键处理记录（恢复前必读）
- **Task 2 的 search_vector 漂移**：`prisma migrate dev --create-only` 生成的 SQL 含一行 `ALTER TABLE "Post" ALTER COLUMN "search_vector" DROP DEFAULT;`（Prisma 对 M3 GENERATED 列的幻影漂移）。**已手工删除该行**后用 `prisma migrate deploy` 应用（非交互）。⚠️ 后续若再生成迁移（M4c 等），同样要删掉这行。`migrate dev` 应用后会因残留幻影漂移卡在交互提示——用 `migrate deploy` 应用 pending 迁移可绕过。
- Task 1/2 对现有文件只做**纯增量**编辑（errors.ts/index.ts/schema.prisma/test/setup.ts），未改任何现有 feature 逻辑。

## 剩余 Task（按计划文件）
- **Task 6**：FollowsController + NotificationsController（含 `@Sse('stream')`）+ DTO + NotificationsModule + **app.module 接线**（改现有 app.module.ts）。所有 service（FollowsService/NotificationsService/NotificationStreamService）已就绪，只差 controller/module/接线。
- **Task 7**：接入 CommentsService（改 comments.service.ts/module/spec）—— ⚠️ 改现有 feature 代码。
- **Task 8**：接入 PostsService 发布扇出（改 posts.service.ts/blog.module/posts.service.spec，每个 describe 都要加 NotificationsService mock）—— ⚠️ 改现有 feature 代码。
- **Task 9**：e2e（关注 + 三类触发 + mark-read + SSE 流，用 `app.listen(0)` + 原生 http 读流）。
- **Task 10–12**：web 客户端 + FollowButton（挂文章页）+ NotificationBell（挂 layout 头部，EventSource 实时）。
- **Task 13**：shared build + `pnpm verify` + 全量 e2e 收口。

恢复：继续 Task 4 起；Task 6 起开始改现有文件（app.module、comments、posts、layout、post 页）。完成后 `superpowers:finishing-a-development-branch`。
