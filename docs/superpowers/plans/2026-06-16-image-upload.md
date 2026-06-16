# 正文图片上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文章编辑器支持粘贴 / 拖拽图片自动上传，图片在光标处以块级、居中（行宽 0.618 倍）形式插入正文，并在阅读页正确渲染。

**Architecture:** 三步推进。①后端沿用头像的 presign→PUT→confirm 模式新增 `images/` 前缀的通用图片接口；②前端给 Tiptap 加 Image 节点 + 一个处理粘贴/拖拽的扩展（上传占位→替换真图），上传走 webp 转码；③自写 Markdown 渲染器 `markdown.ts` 增加 `![alt](url)` 支持，块级图片渲染为 `<figure>`，绝对 URL 直接进正文 Markdown。

**Tech Stack:** NestJS + `@aws-sdk/client-s3`（MinIO）、Next.js + Tiptap v3 + `tiptap-markdown` + `@tiptap/extension-image`、node:test（web）/ jest（api）。

设计来源：`docs/superpowers/specs/2026-06-16-image-upload-design.md`

---

## 参考：复用的既有模式

- 上传流程参照 `apps/web/src/lib/avatar.ts`（presign→webp→PUT→confirm）。
- 后端参照 `apps/api/src/storage/storage.service.ts`、`storage.controller.ts`、`dto/confirm-avatar.dto.ts`、单测 `storage.service.spec.ts`、e2e `apps/api/test/avatar.e2e-spec.ts`。
- 渲染器 `apps/web/src/lib/markdown.ts` + 单测 `markdown.test.ts`（node:test）。
- 公共 URL base：环境变量 `NEXT_PUBLIC_S3_PUBLIC_URL`（avatar.ts 已用，默认 `http://localhost:9000/blog`）。
- 错误码 `ErrorCode.INVALID_UPLOAD`（`@blog/shared`），后端 `AppError`（`apps/api/src/common/app-error.ts`）。

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `apps/api/src/storage/storage.service.ts` | 加 `presignImage` / `confirmImage` | Modify |
| `apps/api/src/storage/storage.service.spec.ts` | 新方法单测 | Modify |
| `apps/api/src/storage/dto/confirm-image.dto.ts` | confirm 入参校验 | Create |
| `apps/api/src/storage/images.controller.ts` | `/me/images` presign+confirm | Create |
| `apps/api/src/storage/storage.module.ts` | 注册新控制器 | Modify |
| `apps/api/test/images.e2e-spec.ts` | 接口 e2e | Create |
| `apps/web/src/lib/image-upload.ts` | 校验 + webp 转码 + 上传 + key→URL | Create |
| `apps/web/src/lib/image-upload.test.ts` | 纯函数单测 | Create |
| `apps/web/src/lib/editor-image-upload.ts` | Tiptap 扩展：占位插件 + 粘贴/拖拽上传 | Create |
| `apps/web/src/components/MarkdownEditor.tsx` | 注册 Image + 上传扩展 | Modify |
| `apps/web/src/lib/markdown.ts` | `![alt](url)` 行内 + 块级支持 | Modify |
| `apps/web/src/lib/markdown.test.ts` | 图片渲染单测 | Modify |
| `apps/web/src/app/globals.css` | figure/img + 编辑器图片样式 | Modify |
| `apps/web/package.json` | 加 `@tiptap/extension-image` | Modify |

---

## 第一步 — 后端：通用图片上传接口

### Task 1: StorageService 新增 presignImage / confirmImage

**Files:**
- Modify: `apps/api/src/storage/storage.service.ts`
- Test: `apps/api/src/storage/storage.service.spec.ts`

- [ ] **Step 1: 追加失败测试**（在 `storage.service.spec.ts` 末尾 `});` 之前插入）

```ts
  it('presignImage returns a url and a user-scoped images webp key', async () => {
    const { url, key } = await service.presignImage('u1');
    expect(url).toBe('https://minio.local/presigned-put');
    expect(key).toMatch(/^images\/u1\/[0-9a-f-]+\.webp$/);
  });

  it('confirmImage rejects a key not owned by the user', async () => {
    await expect(
      service.confirmImage('u1', 'images/u2/abc.webp'),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_UPLOAD });
  });

  it('confirmImage rejects a non-webp content type', async () => {
    headMock.mockResolvedValue({ ContentLength: 1000, ContentType: 'image/png' });
    await expect(
      service.confirmImage('u1', 'images/u1/abc.webp'),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_UPLOAD });
  });

  it('confirmImage rejects when larger than 10MB', async () => {
    headMock.mockResolvedValue({ ContentLength: 11_000_000, ContentType: 'image/webp' });
    await expect(
      service.confirmImage('u1', 'images/u1/abc.webp'),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_UPLOAD });
  });

  it('confirmImage accepts a valid object and returns the key', async () => {
    headMock.mockResolvedValue({ ContentLength: 1_000, ContentType: 'image/webp' });
    await expect(service.confirmImage('u1', 'images/u1/abc.webp')).resolves.toBe(
      'images/u1/abc.webp',
    );
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/api && pnpm jest storage.service.spec`
Expected: FAIL —— `service.presignImage is not a function`

- [ ] **Step 3: 实现两个方法**

在 `storage.service.ts` 顶部常量区，`MAX_BYTES` 下一行加：

```ts
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
```

在 `confirm(...)` 方法之后、类结束 `}` 之前，加：

```ts
  async presignImage(userId: string): Promise<{ url: string; key: string }> {
    const key = `images/${userId}/${randomUUID()}.webp`;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'image/webp',
      }),
      { expiresIn: 300 },
    );
    return { url, key };
  }

  async confirmImage(userId: string, key: string): Promise<string> {
    if (!key.startsWith(`images/${userId}/`)) {
      throw new AppError(
        ErrorCode.INVALID_UPLOAD,
        400,
        'Key does not belong to this user',
      );
    }
    let head: HeadObjectCommandOutput;
    try {
      head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'Uploaded object not found');
    }
    if ((head.ContentLength ?? 0) > IMAGE_MAX_BYTES) {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'File too large');
    }
    if (head.ContentType !== 'image/webp') {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'Unsupported content type');
    }
    return key;
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/api && pnpm jest storage.service.spec`
Expected: PASS（全部，含原有头像用例）

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/storage/storage.service.ts apps/api/src/storage/storage.service.spec.ts
git commit -m "feat(api): add presignImage/confirmImage to StorageService"
```

---

### Task 2: ImagesController + DTO + 模块注册 + e2e

**Files:**
- Create: `apps/api/src/storage/dto/confirm-image.dto.ts`
- Create: `apps/api/src/storage/images.controller.ts`
- Modify: `apps/api/src/storage/storage.module.ts`
- Test: `apps/api/test/images.e2e-spec.ts`

- [ ] **Step 1: 写失败的 e2e 测试**

新建 `apps/api/test/images.e2e-spec.ts`：

```ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';
import { StorageService } from '../src/storage/storage.service';

describe('Image upload (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
    jest.restoreAllMocks();
  });

  const creds = { email: 'img@test.com', password: 'password123', nickname: 'Img' };

  it('presign -> confirm returns the stored key', async () => {
    const storage = app.get(StorageService);
    jest.spyOn(storage, 'presignImage').mockResolvedValue({
      url: 'http://minio/put',
      key: 'images/uid/img.webp',
    });
    jest
      .spyOn(storage, 'confirmImage')
      .mockImplementation(async (_uid: string, key: string) => key);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    const presign = await agent.post('/me/images/presign').expect(201);
    expect(presign.body.url).toBeTruthy();
    expect(presign.body.key).toBe('images/uid/img.webp');
    const confirm = await agent
      .post('/me/images/confirm')
      .send({ key: 'images/uid/img.webp' })
      .expect(201);
    expect(confirm.body.key).toBe('images/uid/img.webp');
  });

  it('presign without auth -> 401', async () => {
    await request(app.getHttpServer()).post('/me/images/presign').expect(401);
  });

  it('confirm with a key owned by someone else -> 400 INVALID_UPLOAD', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    const res = await agent
      .post('/me/images/confirm')
      .send({ key: 'images/someoneelse/x.webp' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');
  });

  it('confirm with a malformed key -> 400 (DTO validation)', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    await agent.post('/me/images/confirm').send({ key: 'not-a-key' }).expect(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/api && pnpm jest --config ./test/jest-e2e.json images.e2e`
Expected: FAIL —— 路由 `/me/images/presign` 不存在（404，断言失败）

- [ ] **Step 3: 建 DTO**

`apps/api/src/storage/dto/confirm-image.dto.ts`：

```ts
import { IsString, Matches } from 'class-validator';

export class ConfirmImageDto {
  @IsString()
  @Matches(/^images\/[^/]+\/[^/]+\.webp$/)
  key!: string;
}
```

- [ ] **Step 4: 建控制器**

`apps/api/src/storage/images.controller.ts`：

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from './storage.service';
import { ConfirmImageDto } from './dto/confirm-image.dto';

@Controller('me/images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign')
  presign(@CurrentUser() current: { userId: string }) {
    return this.storage.presignImage(current.userId);
  }

  @Post('confirm')
  async confirm(
    @CurrentUser() current: { userId: string },
    @Body() dto: ConfirmImageDto,
  ) {
    const key = await this.storage.confirmImage(current.userId, dto.key);
    return { key };
  }
}
```

- [ ] **Step 5: 注册控制器**

`storage.module.ts`：import 后把 `controllers` 改为：

```ts
import { ImagesController } from './images.controller';
// ...
  controllers: [StorageController, ImagesController],
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd apps/api && pnpm jest --config ./test/jest-e2e.json images.e2e`
Expected: PASS（4 个用例）

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/storage/images.controller.ts apps/api/src/storage/dto/confirm-image.dto.ts apps/api/src/storage/storage.module.ts apps/api/test/images.e2e-spec.ts
git commit -m "feat(api): add /me/images presign+confirm endpoints"
```

---

## 第三步（先做渲染，便于端到端验证）— 渲染器：显示图片

> 说明：把渲染器放在编辑器之前实现，是因为它是纯函数、可完全 TDD，且让第二步做完后能立刻在阅读页看到效果。

### Task 3: markdown.ts 支持 `![alt](url)`

**Files:**
- Modify: `apps/web/src/lib/markdown.ts`
- Test: `apps/web/src/lib/markdown.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `markdown.test.ts` 末尾）

```ts
test('renderInline renders a safe image and rejects unsafe src', () => {
  assert.equal(
    renderInline('![cat](http://localhost:9000/blog/images/u/x.webp)'),
    '<img src="http://localhost:9000/blog/images/u/x.webp" alt="cat" loading="lazy">',
  );
  assert.equal(
    renderInline('![x](javascript:alert(1))'),
    '![x](javascript:alert(1))',
  );
});

test('renderInline escapes the image alt text', () => {
  assert.equal(
    renderInline('![a<b>](https://e.com/i.webp)'),
    '<img src="https://e.com/i.webp" alt="a&lt;b&gt;" loading="lazy">',
  );
});

test('renderInline does not confuse an image with a link', () => {
  assert.equal(
    renderInline('see ![pic](https://e.com/i.webp) here'),
    'see <img src="https://e.com/i.webp" alt="pic" loading="lazy"> here',
  );
});

test('renderProse wraps a stand-alone image line in a figure block', () => {
  assert.equal(
    renderProse('![cat](https://e.com/c.webp)'),
    '<figure class="post-image"><img src="https://e.com/c.webp" alt="cat" loading="lazy"></figure>',
  );
});

test('renderProse keeps text paragraphs separate from an image block', () => {
  assert.equal(
    renderProse('hello\n\n![c](https://e.com/c.webp)\n\nworld'),
    '<p>hello</p><figure class="post-image"><img src="https://e.com/c.webp" alt="c" loading="lazy"></figure><p>world</p>',
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && node --test src/lib/markdown.test.ts`
Expected: FAIL —— image 用例不通过（当前把 `!` 留下、`[..](..)` 被当链接）

- [ ] **Step 3: 实现图片支持**

约定：`renderImageTag` 接收**已转义**的 alt（由调用方负责转义），避免二次转义。在 `markdown.ts` 中，`safeHref` 函数之后加这个共享辅助：

```ts
/** Build an <img> from an already-escaped alt and a raw url, or null if unsafe. */
function renderImageTag(escapedAlt: string, url: string): string | null {
  const href = safeHref(url);
  if (!href) return null;
  return `<img src="${href}" alt="${escapedAlt}" loading="lazy">`;
}
```

在 `renderInline` 里，**链接替换之前**（紧接在“Links: [text](url)…”那段 `s = s.replace(...)` 之前）插入图片替换。此处 `alt` 已被函数开头的 `escapeHtml(raw)` 转义，直接传入：

```ts
  // Images: ![alt](url). Must run before links, since ![..](..) contains [..](..).
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, url: string) => {
    return renderImageTag(alt, url) ?? m;
  });
```

在 `renderProse` 的 `while` 循环里，紧接 `if (isBlank(line)) {...}` 之后、标题判断之前，加独立成行图片的块级分支。这里没经过 `renderInline` 的整体转义，所以对 alt 显式 `escapeHtml`（同模块顶部已定义/导出）：

```ts
    const imgOnly = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line);
    if (imgOnly) {
      const tag = renderImageTag(escapeHtml(imgOnly[1]), imgOnly[2]);
      if (tag) {
        out.push(`<figure class="post-image">${tag}</figure>`);
        i++;
        continue;
      }
      // unsafe src: fall through and let it render as a normal paragraph
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/web && node --test src/lib/markdown.test.ts`
Expected: PASS（新旧用例全过）

- [ ] **Step 5: 加图片样式**

`apps/web/src/app/globals.css`，在 `.prose-naturalist ol {...}` 等列表规则附近、`.prose-naturalist` 块内追加：

```css
.prose-naturalist figure.post-image {
  margin-top: 1.4em;
  margin-bottom: 1.4em;
  text-align: center;
}
.prose-naturalist figure.post-image img {
  width: 61.8%;
  height: auto;
  max-width: 100%;
  border-radius: 6px;
}
@media (max-width: 640px) {
  .prose-naturalist figure.post-image img { width: 100%; }
}
```

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/lib/markdown.ts apps/web/src/lib/markdown.test.ts apps/web/src/app/globals.css
git commit -m "feat(web): render markdown images as centered figure blocks"
```

---

## 第二步 — 前端编辑器：粘贴 / 拖拽上传

### Task 4: image-upload.ts（校验 + 转码 + 上传）

**Files:**
- Create: `apps/web/src/lib/image-upload.ts`
- Test: `apps/web/src/lib/image-upload.test.ts`

> 说明：`fileToWebp` / `uploadImage` 依赖浏览器 canvas + fetch，node:test 环境无 DOM，无法单测（与未被测的 `avatar.ts` 同理）。因此把**可测的纯逻辑**（`imageSrc`、`validateImageFile`）单独抽出并测试；DOM/网络编排仅做集成手测（Task 6）。

- [ ] **Step 1: 写失败测试**

新建 `apps/web/src/lib/image-upload.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSrc, validateImageFile } from './image-upload.ts';

test('imageSrc joins the public base and the key', () => {
  assert.equal(
    imageSrc('images/u1/x.webp'),
    'http://localhost:9000/blog/images/u1/x.webp',
  );
});

test('validateImageFile accepts a small jpeg', () => {
  assert.doesNotThrow(() =>
    validateImageFile({ type: 'image/jpeg', size: 1000 } as File),
  );
});

test('validateImageFile rejects an unsupported type', () => {
  assert.throws(() => validateImageFile({ type: 'image/gif', size: 1000 } as File), {
    code: 'INVALID_UPLOAD',
  });
});

test('validateImageFile rejects a file over 10MB', () => {
  assert.throws(
    () => validateImageFile({ type: 'image/png', size: 11 * 1024 * 1024 } as File),
    { code: 'INVALID_UPLOAD' },
  );
});
```

> 默认 base 由 `NEXT_PUBLIC_S3_PUBLIC_URL` 决定；测试断言用默认值 `http://localhost:9000/blog`（与 avatar.ts 默认一致，CI 不设该变量）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && node --test src/lib/image-upload.test.ts`
Expected: FAIL —— 模块/导出不存在

- [ ] **Step 3: 实现**

新建 `apps/web/src/lib/image-upload.ts`：

```ts
import { api, ApiClientError } from "./api";

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "http://localhost:9000/blog";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 1600;

/** Resolve a stored image object key to a browser-loadable absolute URL. */
export function imageSrc(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

/** Throw ApiClientError('INVALID_UPLOAD') if the file is the wrong type or too big. */
export function validateImageFile(file: File): void {
  if (!ALLOWED.has(file.type)) {
    throw new ApiClientError("INVALID_UPLOAD", "图片格式不支持（仅 JPG/PNG/WebP）");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiClientError("INVALID_UPLOAD", "图片不能超过 10MB");
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    img.src = url;
  });
}

/** Re-encode to webp, preserving aspect ratio; downscale to MAX_WIDTH if wider. */
export async function fileToWebp(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("图片转换失败");
  return blob;
}

/** Full flow: validate -> presign -> webp -> PUT -> confirm. Returns absolute URL. */
export async function uploadImage(file: File): Promise<string> {
  validateImageFile(file);
  const { url, key } = await api<{ url: string; key: string }>(
    "/me/images/presign",
    { method: "POST" },
  );
  const webp = await fileToWebp(file);
  const put = await fetch(url, {
    method: "PUT",
    body: webp,
    headers: { "Content-Type": "image/webp" },
  });
  if (!put.ok) {
    throw new ApiClientError("INVALID_UPLOAD", "上传失败，请重试");
  }
  const confirmed = await api<{ key: string }>("/me/images/confirm", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
  return imageSrc(confirmed.key);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/web && node --test src/lib/image-upload.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/image-upload.ts apps/web/src/lib/image-upload.test.ts
git commit -m "feat(web): add image upload lib (validate, webp, presign/confirm)"
```

---

### Task 5: 安装 @tiptap/extension-image

**Files:**
- Modify: `apps/web/package.json`（由 pnpm 写入）

- [ ] **Step 1: 安装依赖**

Run: `pnpm --filter @blog/web add @tiptap/extension-image@^3.26.0`
Expected: package.json 出现 `"@tiptap/extension-image": "^3.26.0"`，lockfile 更新

- [ ] **Step 2: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @tiptap/extension-image dependency"
```

---

### Task 6: Tiptap 上传扩展 + 编辑器集成

**Files:**
- Create: `apps/web/src/lib/editor-image-upload.ts`
- Modify: `apps/web/src/components/MarkdownEditor.tsx`
- Modify: `apps/web/src/app/globals.css`（编辑器内图片 + 占位样式）

> 该任务依赖 ProseMirror/DOM，无法在 node:test 下自动化，采用 `pnpm dev` 手动验证（Step 5）。代码是 ProseMirror 官方图片上传占位配方的改写。

- [ ] **Step 1: 写上传扩展**

新建 `apps/web/src/lib/editor-image-upload.ts`：

```ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { uploadImage } from "./image-upload";
import { ApiClientError } from "./api";

const placeholderKey = new PluginKey("imageUploadPlaceholder");

interface PlaceholderAction {
  add?: { id: object; pos: number };
  remove?: { id: object };
}

const placeholderPlugin = new Plugin({
  key: placeholderKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      set = set.map(tr.mapping, tr.doc);
      const action = tr.getMeta(placeholderKey) as PlaceholderAction | undefined;
      if (action?.add) {
        const el = document.createElement("span");
        el.className = "image-upload-placeholder";
        el.textContent = "上传中…";
        const deco = Decoration.widget(action.add.pos, el, { id: action.add.id });
        set = set.add(tr.doc, [deco]);
      } else if (action?.remove) {
        const id = action.remove.id;
        set = set.remove(set.find(undefined, undefined, (spec) => spec.id === id));
      }
      return set;
    },
  },
  props: {
    decorations(state) {
      return placeholderKey.getState(state);
    },
  },
});

function findPlaceholder(view: EditorView, id: object): number | null {
  const set = placeholderKey.getState(view.state) as DecorationSet | undefined;
  const found = set?.find(undefined, undefined, (spec) => spec.id === id);
  return found && found.length ? found[0].from : null;
}

async function startUpload(
  view: EditorView,
  file: File,
  pos: number,
  onError: (msg: string) => void,
): Promise<void> {
  const id = {};
  const tr = view.state.tr;
  if (!tr.selection.empty) tr.deleteSelection();
  tr.setMeta(placeholderKey, { add: { id, pos } });
  view.dispatch(tr);

  try {
    const url = await uploadImage(file);
    const at = findPlaceholder(view, id);
    if (at == null) return; // placeholder removed while uploading
    const node = view.state.schema.nodes.image.create({ src: url });
    view.dispatch(
      view.state.tr
        .replaceWith(at, at, node)
        .setMeta(placeholderKey, { remove: { id } }),
    );
  } catch (e) {
    view.dispatch(view.state.tr.setMeta(placeholderKey, { remove: { id } }));
    onError(e instanceof ApiClientError ? e.message : "图片上传失败");
  }
}

function imageFilesFrom(list: FileList | undefined | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}

export interface ImageUploadOptions {
  onError: (msg: string) => void;
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: "imageUpload",
  addOptions() {
    return { onError: () => {} };
  },
  addProseMirrorPlugins() {
    const onError = this.options.onError;
    return [
      placeholderPlugin,
      new Plugin({
        props: {
          handlePaste(view, event) {
            const files = imageFilesFrom(event.clipboardData?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const pos = view.state.selection.from;
            files.forEach((file) => void startUpload(view, file, pos, onError));
            return true;
          },
          handleDrop(view, event) {
            const files = imageFilesFrom(
              (event as DragEvent).dataTransfer?.files,
            );
            if (files.length === 0) return false;
            event.preventDefault();
            const coords = view.posAtCoords({
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            });
            const pos = coords?.pos ?? view.state.selection.from;
            files.forEach((file) => void startUpload(view, file, pos, onError));
            return true;
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 2: 在编辑器注册 Image + 上传扩展**

`apps/web/src/components/MarkdownEditor.tsx`：

顶部 import 区追加：

```ts
import Image from "@tiptap/extension-image";
import { ImageUpload } from "@/lib/editor-image-upload";
```

把 `useEditor` 的 extensions 改为（注意 `ImageUpload` 用 `setError` 报错，需在组件作用域内 configure）：

```ts
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      ImageUpload.configure({ onError: setError }),
      Markdown,
    ],
    content: initialMarkdown,
    immediatelyRender: false,
  });
```

> `setError` 已在组件中定义（`const [error, setError] = useState<string | null>(null)`），可直接作为闭包传入。

- [ ] **Step 3: 编辑器内图片 + 占位样式**

`apps/web/src/app/globals.css` 末尾追加：

```css
.ProseMirror img {
  display: block;
  width: 61.8%;
  height: auto;
  max-width: 100%;
  margin: 1.2em auto;
  border-radius: 6px;
}
@media (max-width: 640px) {
  .ProseMirror img { width: 100%; }
}
.image-upload-placeholder {
  display: inline-block;
  padding: 0.1em 0.6em;
  margin: 0 0.2em;
  font-size: 0.85em;
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: 4px;
}
```

- [ ] **Step 4: 跑 lint/typecheck**

Run: `pnpm verify`
Expected: PASS（lint + typecheck + test 全绿）

- [ ] **Step 5: 手动验证（关键）**

1. `pnpm dev`，浏览器登录后打开 `/editor/new`。
2. 在正文写一段字，光标停在段末，`Cmd/Ctrl+V` 粘贴一张截图 → 出现“上传中…”占位 → 替换为居中图片（约行宽 0.618）。
3. 从文件管理器拖一张图到正文中间某处 → 落点处插入图片。
4. 继续在图片下方打字，确认图片是块级、独占一行、文字不环绕。
5. 存草稿→发布，打开阅读页，确认图片同样居中渲染。
6. 拖一个超 10MB 或非图片文件 → 顶部出现错误提示、无残留占位。

Expected：以上全部符合；正文 Markdown 中图片为 `![](http://localhost:9000/blog/images/<uid>/<uuid>.webp)`。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/lib/editor-image-upload.ts apps/web/src/components/MarkdownEditor.tsx apps/web/src/app/globals.css
git commit -m "feat(web): paste/drop image upload in the editor with placeholders"
```

---

## 收尾

- [ ] **最终校验**

Run: `pnpm verify`
Expected: 全绿（Stop hook 守门，必须通过）

- [ ] **如在 worktree/分支，按 finishing-a-development-branch 流程合并**

---

## Self-Review 记录

- **Spec 覆盖**：排版块级（Task 3/6 样式）、0.618 居中（Task 3/6 CSS）、无 caption（figure 不含 figcaption）、webp+1600 降尺寸不裁剪（Task 4 `fileToWebp`）、jpeg/png/webp≤10MB（Task 1 服务端 + Task 4 客户端）、绝对 URL 进 Markdown（Task 4 `uploadImage` 返回 `imageSrc`）、presign/confirm 复用（Task 1/2）、`![alt](url)` 渲染（Task 3）、测试覆盖（Task 1/2/3/4）。全部有对应任务。
- **占位符扫描**：无 TBD/TODO；每个代码步给出完整代码。
- **类型一致性**：`presignImage`/`confirmImage`（api 全程一致）、`imageSrc`/`validateImageFile`/`fileToWebp`/`uploadImage`（web 全程一致）、`ImageUpload` 扩展名与 `configure({ onError })` 一致、image 节点名 `image`（@tiptap/extension-image 默认）与 `schema.nodes.image` 一致。
