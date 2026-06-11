# M3 search — 设计文档

> 日期：2026-06-11｜作者：tangziyu（brainstorm with Claude）｜状态：已评审，待写实施计划
> 范围：全文检索垂直切片 —— Postgres `tsvector` + 应用层 `nodejieba` 分词 + `pg_trgm` 兜底，标题/正文/标签加权；后端 `GET /search` + 前端搜索页
> 参考：`docs/prd.md` §3.2「检索（混合）」、`.claude/skills/nextjs/SKILL.md`（naturalist journal）、M2 既有 blog-core 代码

## 1. 目标与非目标

### 目标
- 读者能用关键词搜已发布文章，命中标题/正文/标签，按相关度排序。
- 中文分词在应用层用 `nodejieba`，写入时分词、查询时同样分词（分析对称）。
- 标题 > 标签 > 正文 加权；`pg_trgm` 对无命中/错字查询兜底。
- 后端 `GET /search` 接口 + 前端 `/search` 搜索页（搜索框、结果高亮、分页、空态），遵循 naturalist journal 设计规范。
- 检索 P95 ≤ 300ms（PRD 验收）。
- 搜索服务按「可插拔召回路」架构，为后续语义检索 + RRF 融合**预留接口**。

### 非目标（本里程碑明确不做）
- **语义检索 / embedding 生成 / 向量列 / RRF 融合**：本里程碑不实现。原始 M3 brief 含「语义 + 混合(RRF)」，经评审**降级**为仅全文检索；语义路后续里程碑接入。
- **BullMQ / 异步索引任务**：`tsvector` 由 DB 生成列同步维护，无需队列。
- **搜索词埋点 / 热搜榜 / 搜索建议（autocomplete）**：留后。
- **跨作者私密草稿搜索**：只搜 `PUBLISHED`。

> 关于 `ANTHROPIC_API_KEY`：`.env.example` 中预留的该密钥**不能**用于 embedding —— Anthropic 无 embedding API（官方推荐 Voyage AI）。语义检索接入时需另选 embedding 源（OpenAI text-embedding-3 / Voyage / 本地 bge-m3），届时独立决策，本里程碑不涉及。

## 2. 关键决策（brainstorm 结论）

| 决策 | 选择 | 理由 |
|------|------|------|
| 中文分词 | **应用层 `nodejieba`** | `pgvector:pg16` 镜像不含 `zhparser`；应用层分词不改 Docker 镜像、纯函数可单测、不违背「不引入新基础设施」铁律 |
| 范围 | **仅全文检索**，语义/RRF 降级留后 | YAGNI；embedding 源未定且引入新依赖，本切片先闭合 FTS 可用环 |
| `tsvector` 维护 | **方案 A：应用写分词文本列 + Postgres `GENERATED` tsvector 列 + GIN 索引** | 不变式（向量与内容一致）由 DB 强制，应用只负责写分词文本，永不漂移；加权声明式 |
| 加权 | 标题 A > 标签 B > 正文 C | 对应 PRD「标题/正文/标签字段加权」 |
| FTS 配置 | `'simple'` | token 已在应用层切好，无需 PG 词干/停用词处理 |
| 兜底 | `pg_trgm` 相似度（仅 tsquery 稀疏时触发） | 覆盖错字/前缀；PRD 把 `pg_trgm` 定位为补充而非主路 |
| 召回架构 | `Retriever[]` + `fuse()` 接缝（当前单路 FTS，`fuse()` 直通） | 后续加 `VectorRetriever` + RRF 时，controller/DTO/分页/前端零改动 |
| 交付范围 | **API + 前端搜索页** | 完整垂直切片，读者可用 |
| 高亮 | `ts_headline`（仅 `<b>`）+ 最小白名单消毒 | 避免 `dangerouslySetInnerHTML` 渲染任意内容 |

## 3. 数据模型（Prisma + 原始 SQL）

`Post` 新增三个分词文本列（一个 migration）：

```prisma
model Post {
  // ...existing fields...
  titleTokens String @default("")  // nodejieba(title)
  bodyTokens  String @default("")  // nodejieba(去 markdown 语法后的 contentMd)
  tagsTokens  String @default("")  // nodejieba(tags.join(' '))
}
```

同一 migration 末尾追加原始 SQL（Prisma 无法表达 `tsvector` / 生成列）：

```sql
-- pg_trgm 若未在 0_init 启用，则在此启用
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Post" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("titleTokens", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("tagsTokens",  '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("bodyTokens",  '')), 'C')
  ) STORED;

CREATE INDEX post_search_vector_idx ON "Post" USING GIN (search_vector);
CREATE INDEX post_title_trgm_idx ON "Post" USING GIN ("title" gin_trgm_ops);
```

**Tokenizer**（`apps/api/src/search/tokenizer.ts`）：纯函数
```ts
export function tokenize(text: string): string  // nodejieba.cut → 小写 → 空格连接
```
无 DB/Nest 依赖，写入时与查询时共用，保证分析对称。`bodyTokens` 先剥离 markdown 语法（复用渲染层已有的 md→text，或轻量正则）再分词。

**写入路径**：`PostsService.create/update` 在 `title/contentMd/tags` 变更时，经一个共享 helper `buildPostTokens(post)` 写三列；`search_vector` 由 DB 自动派生。

**回填**：migration 以 `@default("")` 加列；一次性幂等脚本 `pnpm --filter api search:reindex` 对全部已有文章分词并写 token 列，生成列自动跟随。

## 4. 搜索服务与查询流程

**模块**：新建 `apps/api/src/search/`（`SearchModule` / `SearchService` / `SearchController` / `tokenizer.ts`），导入 `PrismaService`，独立于 `blog/`。

**Retriever 接口（语义路预留接缝）**：
```ts
interface RankedHit { postId: string; score: number; }
interface Retriever {
  name: string;  // 'fts' | (later) 'vector'
  retrieve(q: string, limit: number): Promise<RankedHit[]>;
}
```
`SearchService` 持有 `Retriever[]` 与 `fuse()` 步骤。**当前**仅 `FtsRetriever`，`fuse()` 直通。**后续**加 `VectorRetriever` 并把 `fuse()` 换成 RRF（`score = Σ 1/(k + rank_i)`，k=60）即可，controller/DTO/分页/前端不变。

**`FtsRetriever` 查询**（参数化 `$queryRaw`，仅 `PUBLISHED`）：
1. 用同一 `tokenize()` 切查询词 → 以 `&` 连接构造 tsquery（`websearch_to_tsquery` / `plainto_tsquery`，`'simple'` 配置）。
2. 主排序：`ts_rank_cd(search_vector, query)` 降序。
3. 兜底：当 tsquery 命中 < 阈值 N 时，追加 `pg_trgm` `similarity("title", $raw) > 0.3` 的结果（去重），覆盖错字/前缀。

**结果组装**：`SearchService` 把排序后的 `postId` 映射回 `PostSummary`（复用 `post.mapper.ts` 的 `toSummary`），保持排名序；高亮经 `ts_headline('simple', contentMd, query, 'MaxFragments=2, MinWords=5, MaxWords=20')`，仅对当前页切片（≤50 行）执行。

**性能（P95 ≤ 300ms）**：GIN 索引使 tsquery 走索引扫描；trgm 兜底仅稀疏时触发；`ts_headline` 只跑页切片而非全命中集。测试中对 seeded corpus 加 P95 断言。

## 5. API 契约

`GET /search?q=<string>&page=1&pageSize=10`（公开，无需认证）
- DTO（`class-validator`，铁律4）：`q` 必填、trim、1–100 字符；`page ≥ 1`；`pageSize 1–50`。空/纯空白 `q` → `400 VALIDATION_ERROR`（复用统一 `{code,message,traceId}` 过滤器）。
- 响应：复用 `Paginated<PostSummary>`，每项新增可选 `highlight?: string`（`ts_headline` 片段）。在 `packages/shared` 给 `PostSummary` 加该可选字段，前后端共用一份类型（铁律1）。
- `total` 来自同一 tsquery 的 `count(*)`。

## 6. 前端搜索页

**共享 client** `apps/web/src/lib/search.ts`：
```ts
export async function searchPosts(q: string, page = 1): Promise<Paginated<PostSummary>>
```
普通 `fetch`（公开端点，`cache: "no-store"`），仿 `posts.ts`。

**页面** `apps/web/src/app/search/page.tsx`（Client Component，`useSearchParams` 读 `?q=`）：
- **搜索框**：输入 + 提交，提交时更新 URL `?q=`（结果可链接/分享、支持后退）；submit 驱动，debounce 可选。
- **结果**：复用既有 `PostCard`；有 `highlight` 时在标题下渲染（消毒后的 `ts_headline` HTML），否则回退 `summary`；保持服务端排名序。
- **状态**：空态（未输入 → 提示）、无结果（naturalist 风格空插画，取 `components/illustrations` 的 `Foliage`/`Bird`）、加载骨架、`ApiClientError` → 内联错误。
- **分页**：prev/next，依 `Paginated.total`，同列表页。
- **样式**：遵循 naturalist journal SKILL —— 同配色/衬线标题、结果上方装饰分隔线、空态插画点缀；复用既有组件，不引入新设计语言。
- **入口**：在既有 header/layout 加搜索图标/链接指向 `/search`。

**`ts_headline` 安全**：片段为服务端生成、用 `<b>` 包裹命中的 HTML；限制 `ts_headline` 用默认 `<b>` 标签，前端经最小消毒器（仅放行 `<b>`）渲染，不用裸 `dangerouslySetInnerHTML` 渲染任意内容。

## 7. 错误处理与测试

**错误处理**：沿用全局异常过滤器，统一 `{code, message, traceId}`（铁律9）；验证失败复用既有 `VALIDATION_ERROR`，无新增错误码（除非实现中确有需要）。

**测试**（铁律6，P0 带测试）：
- `tokenizer` 单测：纯中文 / 中英混合 / 空串 / 标点。
- `FtsRetriever` 集成测试（seeded corpus）：加权顺序（标题命中排正文之前）、trgm 兜底触发、分页正确性。
- 「同义不同词」召回用例**预期失败 / 跳过**并注明 —— 语义检索本里程碑降级，留作后续里程碑的回归基线。
- `GET /search` e2e：DTO 校验、分页、响应形状、高亮字段存在。
- P95 延迟断言：seeded corpus 上 `GET /search` P95 ≤ 300ms。

## 8. 验收标准

- [ ] 关键词搜索命中标题/正文/标签，标题权重最高。
- [ ] 中文查询经 `nodejieba` 分词，能命中分词后的中文文章。
- [ ] 错字/前缀查询经 `pg_trgm` 兜底有合理结果。
- [ ] 结果高亮命中片段，分页正确，空态/无结果/错误态均有 UI。
- [ ] `GET /search` P95 ≤ 300ms（seeded corpus）。
- [ ] `pnpm verify` 全绿（lint + typecheck + test）。
- [ ] 搜索服务保留 `Retriever`/`fuse()` 接缝，语义路可后续接入而不改 controller/前端。
