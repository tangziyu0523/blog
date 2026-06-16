# 正文图片上传 — 设计文档

日期：2026-06-16
状态：已确认，待生成实现计划

## 背景与目标

文章编辑器（`apps/web/src/components/MarkdownEditor.tsx`，基于 Tiptap + `tiptap-markdown`，正文以 Markdown 存储）目前不支持图片。本功能让作者能：

1. **粘贴图片**（Ctrl/Cmd+V）自动上传。
2. **拖拽图片**到编辑器自动上传。
3. 图片在**光标处就地插入**，出现在正文中作者放置的位置。

PRD 对应项：编辑器“图片粘贴上传（走对象存储）”（P0，`docs/prd.md` §编辑器）。

现状盘点：
- 已有 **presign → PUT → confirm** 上传流程，但写死在头像（`avatars/{userId}/`）：`apps/api/src/storage/storage.service.ts`、`storage.controller.ts`、前端 `apps/web/src/lib/avatar.ts`。
- 渲染走自写纯 Markdown 解析器 `apps/web/src/lib/markdown.ts`（`renderInline`/`renderProse`）+ Shiki 代码块，组件 `MarkdownRenderer.tsx`。**当前支持链接但不支持 `![alt](url)` 图片语法**。
- 已有错误码 `INVALID_UPLOAD`、统一错误结构、`StorageService` 的 S3/MinIO 客户端。

## 关键设计决策

| 决策点 | 选择 |
|--------|------|
| 排版方式 | **块级、独占一行**，在文档流中按光标位置插入；文字不环绕 |
| 显示宽度 | **居中**，宽度 = 正文行宽 × **0.618**，`height: auto`（保持原始宽高比） |
| 图说 caption | 暂不支持；但渲染为 `<figure><img></figure>` 结构，便于以后加 `<figcaption>` |
| 客户端处理 | 等比转 **webp**；宽 > **1600px** 时等比降尺寸；**不裁剪**（区别于头像的方形裁剪） |
| 允许格式 / 上限 | 输入 jpeg/png/webp，≤ **10MB**（转 webp 后实际存储更小） |
| Markdown 中的地址 | 存**绝对公共 URL**（`![](http://…/blog/images/…webp)`）。换存储域名需一次性全文替换迁移——个人博客可接受，换取编辑器/序列化/渲染三处都无需 key↔URL 解析 |
| 是否入库 | 否。图片 URL 直接进正文 Markdown，无需新表/迁移 |

## 实现分三步（按用户指定顺序）

### 第一步 — 后端：通用图片上传接口

沿用头像的 presign/confirm 模式，但不写用户记录、key 前缀改为 `images/`。

**`StorageService` 新增方法**（`apps/api/src/storage/storage.service.ts`）：
- `presignImage(userId): Promise<{ url; key }>` — key = `images/${userId}/${randomUUID()}.webp`，`PutObjectCommand` ContentType `image/webp`，`expiresIn: 300`。
- `confirmImage(userId, key): Promise<{ key }>` — 校验 `key.startsWith('images/${userId}/')`；`HeadObjectCommand` 校验 `ContentType === 'image/webp'` 且 `ContentLength ≤ 10MB`；不通过抛 `AppError(ErrorCode.INVALID_UPLOAD, 400, …)`。
  - 新增常量 `IMAGE_MAX_BYTES = 10 * 1024 * 1024`，与头像的 `MAX_BYTES`（2MB）区分。

**新控制器** `apps/api/src/storage/images.controller.ts`（`@Controller('me/images')` + `@UseGuards(JwtAuthGuard)` + `@CurrentUser()`）：
- `POST /me/images/presign` → `storage.presignImage(userId)`。
- `POST /me/images/confirm` → body `{ key }`（class-validator DTO，`@IsString()` 非空），返回 `{ key }`。

在 `StorageModule` 注册新控制器。共享类型放 `packages/shared`（如需 presign 响应类型）。

### 第二步 — 前端编辑器：粘贴 / 拖拽上传

**依赖**：加 `@tiptap/extension-image`（StarterKit 不含 Image 节点），在 `MarkdownEditor` 的 `extensions` 中注册并配置块级显示。

**新文件 `apps/web/src/lib/image-upload.ts`**：
- `fileToWebp(file): Promise<Blob>` — canvas 等比绘制（不裁剪）；若 `img.width > 1600` 按比例缩放到 1600px 宽；`toBlob('image/webp', 0.9)`。
- `imageSrc(key): string` — 用 `NEXT_PUBLIC_S3_PUBLIC_URL`（同 `avatar.ts` 的 `PUBLIC_BASE`）拼绝对 URL。
- `uploadImage(file): Promise<string>` — 客户端先校验类型 ∈ {jpeg,png,webp} 且 size ≤ 10MB（否则抛 `ApiClientError('INVALID_UPLOAD', …)`）→ `POST /me/images/presign` → `fileToWebp` → 裸 `fetch` PUT（`Content-Type: image/webp`，不带 cookie）→ `POST /me/images/confirm` → 返回 `imageSrc(key)`（绝对 URL）。

**编辑器集成**（`MarkdownEditor.tsx` 的 `useEditor({ editorProps })`）：
- `handlePaste` / `handleDrop`：检出 `DataTransfer` 中的图片文件 → `preventDefault` → 在光标 / 落点处插入**上传占位**（带唯一 id 的 ProseMirror placeholder decoration / plugin）→ 调 `uploadImage` → 成功后按 id 定位、替换为 image 节点（src = 绝对 URL）；失败移除占位并通过现有 `error` 状态提示。
- 多个文件按顺序处理，各自独立占位。
- `tiptap-markdown` 将 image 节点序列化为 `![](绝对URL)` 进正文。

### 第三步 — 渲染器：显示图片

**`apps/web/src/lib/markdown.ts`**：
- `renderProse`：识别**单独成行**的 `![alt](url)`（正则匹配整行）→ 输出块级 `<figure class="post-image"><img src=… alt=…></figure>`；URL 经 `safeHref`（仅 http(s)）校验，不合法则原样输出文本。
- `renderInline`：兜底支持行内 `![alt](url)`（需在链接规则**之前**处理，避免被 `[..](..)` 抢匹配），同样过 `safeHref`。alt 经 `escapeHtml`。

**样式**（`.prose-naturalist` 所在的全局/模块 CSS）：`figure.post-image` 居中（`margin-inline:auto`、`text-align:center`），`img` `width:61.8%`、`height:auto`、`max-width:100%`；窄屏（如 `max-width: 640px`）放宽到 `width:100%`。编辑器内 image 节点用同一套规则，保证所见即所得。

## 错误处理

- 客户端：格式/体积不符 → `ApiClientError('INVALID_UPLOAD', 中文提示)`；presign/PUT/confirm 任一失败 → 移除占位、设置 `error` 文案，不留孤儿占位。
- 服务端：归属/类型/体积校验失败 → `AppError(ErrorCode.INVALID_UPLOAD, 400, …)`，走统一错误结构 `{ code, message, traceId }`。
- 渲染端：非法图片 URL 不渲染 `<img>`，降级为原文，杜绝注入。

## 测试（铁律 6）

- **API**：`images.e2e-spec.ts`（仿 `avatar.e2e-spec.ts`）——presign 返回 key/url 形态、confirm 拒绝他人 key、拒绝错误类型/超限、放行合法对象。
- **StorageService 单测**：`presignImage` key 形态、`confirmImage` 各校验分支（mock `@aws-sdk/client-s3` 与 presigner，仿现有 `storage.service.spec.ts`）。
- **`markdown.ts` 单测**（价值最高，纯函数）：独立成行图片 → `<figure>`；行内图片；非法/危险 URL 降级；alt 转义；图片与链接混排不串。
- **`image-upload.ts` 单测**：类型/体积校验分支、presign→PUT→confirm 调用序列（mock `api` 与 `fetch`）。

## 不做（YAGNI）

- 不做四周文字环绕 / 浮动布局。
- 不做 caption / 图说编辑。
- 不做图片入库、图库管理、删除清理（孤儿对象暂不回收）。
- 不做 GIF 动图（转 webp 会丢动画，本期格式仅 jpeg/png/webp）。
- 不做相对 key 存储与渲染期解析（已选绝对 URL）。
