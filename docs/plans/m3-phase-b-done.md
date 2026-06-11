# M3 Phase B — 完成状态

> 日期：2026-06-11｜分支：`feat/m3-search`（**未合并 main**）｜执行：subagent-driven development
> 范围：M3 全文检索前端切片（Task 11–13）。语义检索/RRF 按 spec 非目标，不在本里程碑。

## 结论

**Phase B（Task 11–13）全部完成，`pnpm verify` 全绿（8/8），web build 通过，工作树干净。**
此前 Phase A（Task 1–9 后端）+ Task 10（后端 e2e，7/7 通过）已完成。M3 全文检索端到端可用。

## Phase B 交付

| Task | 内容 | 文件 | Commit | 状态 |
|------|------|------|--------|------|
| 11 | 前端搜索 API 客户端 + HTML 消毒器 | `apps/web/src/lib/search.ts`、`apps/web/src/lib/sanitize-highlight.ts` | `7531472` | ✅ verify 绿 |
| 12 | `/search` 页面（搜索框、结果、空态、分页、高亮） | `apps/web/src/app/search/page.tsx` | `7e822ab` | ✅ build + verify 绿 |
| 13 | Header 搜索入口 | `apps/web/src/app/layout.tsx` | `f7c8fc7` | ✅ build + verify 绿 |

## 验证记录

- `pnpm verify`：**8 successful, 8 total**，0 errors（36 条 warning 全部是 `@blog/api` 既有 e2e 测试文件里的 `no-unsafe-argument`，与本次无关）。
- `pnpm --filter @blog/web build`：**Compiled successfully**，`/search` 作为静态路由 `○ /search` 出现在路由表。
- 每个 task 均在 `pnpm verify` 全绿后才提交（符合要求）。
- 工作树干净（`git status` 无未提交改动）。

## 实现说明（与 plan 的合理偏差）

1. **Task 12 — `startTransition`**：`useEffect` 内的 `setState` 调用按 `eslint-config-next` 的 `react-hooks/set-state-in-effect` 规则用 `startTransition()` 包裹（与本仓库 editor 页一致）。`cancelled` 取消标志逻辑保留完好，异步行为不变。空态文案中的引号转义为 `&ldquo;`/`&rdquo;` 以满足 `react/no-unescaped-entities`。
2. **Task 13 — `next/link`**：Header 用 Next 的 `<Link>` 而非 `<a>`（`@next/next/no-html-link-for-pages` 要求），更正确。
3. 两处偏差均为通过严格 Next lint（即 `pnpm verify` 绿）所必需，不改变设计意图。

## 前端行为概览

- `/search?q=&page=` 客户端组件，`useSearchParams` 用 `<Suspense>` 包裹（App Router 要求，build 已验证）。
- 复用既有 `PostCard` 渲染结果；命中片段经 `sanitizeHighlight`（仅放行 `<b>`）后渲染。
- 状态：未输入提示、加载中、错误内联、无结果（`Foliage2` 插画空态）、结果列表 + prev/next 分页。
- 样式遵循 naturalist journal 设计令牌（`--font-display`/`--text-2`/`--text-3`/`--border`/`--surface`）。

## 边界（按要求）

- ❌ **未合并到 main** —— 仍在 `feat/m3-search`，待人工决定合并方式。
- ❌ **未做 M4**。
- Docker 全程健康（postgres/redis/minio 均 Up healthy），无中断，未触发 BLOCKED 流程。

## 后续（不在本次范围）

- 合并 `feat/m3-search` → main（建议先 `pnpm --filter @blog/api test:e2e` 复跑确认）。
- 生产部署后手动跑一次 `pnpm --filter @blog/api search:reindex` 回填既有文章的分词列。
- 语义检索 + RRF：后续里程碑，按 spec 预留的 `Retriever`/`fuse()` 接缝接入。

## 完整 M3 提交链（`feat/m3-search`）

```
f7c8fc7 feat(web): add search link to global header
7e822ab feat(web): add /search page with results, highlight, empty state, pagination
7531472 feat(web): add search client and highlight sanitizer
b6f2963 test(search): e2e for ranking, draft exclusion, trgm fallback, validation, perf
55217fc style(search): prettier formatting in tokenizer/highlight specs
3f54577 feat(search): expose GET /search endpoint
ad1a7d0 feat(search): add SearchService with fuse seam, pagination and highlight
d906223 feat(search): add Retriever interface and FtsRetriever with trgm fallback
d006128 feat(search): add one-off reindex backfill script
199274c feat(search): index posts by writing tokenized columns on create/update
ba8ddd4 feat(search): add tokenized columns, generated tsvector, GIN + trgm indexes
abf26c4 feat(search): add application-side CJK-aware highlight builder
db2f564 feat(search): add nodejieba tokenizer and markdown stripper
5e93f3f chore(search): add nodejieba dep and PostSummary.highlight field
839f45f docs: M3 search implementation plan
16ae0e5 docs: M3 search design spec (FTS-only, semantic deferred)
```
