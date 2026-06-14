# 首页滚动编排规格（Scroll Choreography）— 修订版

> 状态：**设计已确认，待实现**。在 `feat/ink-layer` 分支推进。
> 性质：纯前端叙事编排层，**不影响数据流与 SEO**，可随时下线回退为普通长页。
>
> 修订说明：本版**废弃**早期「3D `rotateY` 翻页 + snap 收停」方案。
> 该方案本质是**离散页面切换**，无论参数如何调都呈现「PPT 硬切」感。
> 现改为社区标准的 **pin-and-fade 连续交叉淡入淡出（crossfade）** 模式。
> 演进详见文末「修订历史」。

## 定位

首页滚动叙事分为两段，从「策展叙事」平滑过渡到「常规索引」：

1. **书页段**——Hero + 2~3 个作者级「书页」，pin 住做连续交叉淡入淡出。
2. **索引段**——「开书成索引」后，文章列表脱离 pin，回归常规垂直滚动 + 轻量逐词显影。

## 内容模型（核心决策，不变）

| 段落 | 内容来源 | 是否随文章流变化 |
|------|----------|------------------|
| 书页段（Hero + 2~3 书页） | **固定策展内容**，手工编排 | ❌ 否 |
| 索引段（文章列表） | 动态文章流（`fetchPublishedPosts`） | ✅ 是 |

**铁律：书页只绑定固定策展内容，不绑架动态文章流。**

- 书页是作者级精选叙事单元，由人工策展，与文章发布 / 删除 / 排序解耦。
- 文章数量变化只影响索引段，书页段结构稳定不受影响。
- 「开书成索引」是两段之间的锚点：最后一页书 dwell 到 pin 末尾 → 索引段以常规滚动接管。

## 转场架构（修订版核心）

社区标准 pin-and-fade：单 pin 容器 + 绝对叠层 + **一条统一 timeline** 上首尾相接、相邻重叠的 fade tween。
**不是每层各自独立 ScrollTrigger**——后者正是离散「切换」感的根源。

### 结构

```
.stage                         ← 外层 wrapper（pin-spacer 落点）
  .frame (pin, 100vh, overflow:hidden, relative)
    .chapter-layer  (absolute inset:0)   ← 书页 1
    .chapter-layer  (absolute inset:0)   ← 书页 2
    .chapter-layer  (absolute inset:0)   ← 书页 3
```

- 三页绝对定位、同起点叠放在一个 viewport 高的 `frame` 里。
- `frame` 由 `ScrollTrigger { pin: true }` 在视口中**钉住**（pin 只作「保持」用，
  不再有 snap——离散感来自 snap，已彻底移除）。pin 也是 ScrollSmoother 兼容的固定方式
  （原生 `sticky` 在 smoother 的 transform 下会失效）。

### 统一 timeline（3 页，slow-paced ≈ 1310vh）

- `TRAVEL = 13.06`（pin 跨度 ≈ 1310vh），`end: () => "+=" + innerHeight * TRAVEL`。
- `FADE = 0.3584`（单次过渡窗 ≈ 468vh），`CROSSFADE_AT = [0, 0.1062, 0.5425]`（各过渡窗起点，进度）。
- timeline duration 归一化为 1，每个 tween 的 position 即滚动进度 0–1。
- 相邻页的「淡出」与「淡入」**落在同一时间窗、同步进行**（即交叉重叠区 / 允许的「重影」）。

每页透明度包络（进度 0→1，█ 实显 / ░ 渐变 / · 隐藏）。长过渡窗承载流动感，停留收短：

```
progress 0.00  0.11               0.46 0.54               0.90  1.0
P1  █████▓▒░░░░░░░░░░░░·······························   hold → out
P2  ·····░░░░░░░░░░░░▒█████▓░░░░░░░░░░░░░░············   in → hold → out
P3  ························░░░░░░░░░░░░░░▒█████████   in → hold 至末尾
        ↑——— 长 crossfade ———↑    ↑——— 长 crossfade ———↑
```

| 段 | 进度区间 | 说明 |
|----|----------|------|
| P1 solo dwell | 0.00 – 0.11 | 起始即可见，无淡入（≈139vh） |
| crossfade 1 | 0.11 – 0.46 | P1 淡出 ∥ P2 淡入（≈468vh） |
| P2 solo dwell | 0.46 – 0.54 | ≈102vh |
| crossfade 2 | 0.54 – 0.90 | P2 淡出 ∥ P3 淡入（≈468vh） |
| P3 solo dwell | 0.90 – 1.00 | dwell 到 pin 末尾，再交给索引（≈129vh） |

- 停留 vs 过渡 ≈ **28% / 72%**：过渡（渐融）承载流动感，停留保留可读的阅读节拍。
- 单次过渡窗 = 0.3584 × 1310vh ≈ **468vh**；三页停留 ≈ 139 / 102 / 129vh。

### 每次 fade 的动画量（opacity + 轻微 scale）

- 透明度用 `autoAlpha`（= opacity + `visibility`），淡尽的页不吃指针事件、不绘制。
- 叠加**轻微 scale 做深度层次**（不是 y 位移——y 会读成「滑动/切换」；scale 读成「从背后浮现 / 退回雾中」，更贴合「渗透而非翻动」）：
  - 淡入：`autoAlpha 0 → 1`，`scale 1.04 → 1`
  - 淡出：`autoAlpha 1 → 0`，`scale 1 → 0.99`
- 缓动 `power1.inOut`；`scrub: 1.5`（从容跟随，可调）；`invalidateOnRefresh: true`。

### 初始状态（仅在动效分支用 `gsap.set` 施加）

```
layer:  position:absolute; inset:0
inner page i:  autoAlpha = (i===0 ? 1 : 0);  scale = (i===0 ? 1 : 1.04)
```

### 时间线伪代码

```
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: frame, start: "top top",
    end: () => "+=" + innerHeight * TRAVEL,
    pin: true, scrub: 1.5, invalidateOnRefresh: true,
  },
});
// crossfade 1 @0.106，窗宽 FADE=0.3584
tl.to(P1, { autoAlpha: 0, scale: 0.99, ease: "power1.inOut", duration: 0.3584 }, 0.1062)
  .to(P2, { autoAlpha: 1, scale: 1,    ease: "power1.inOut", duration: 0.3584 }, 0.1062)
// crossfade 2 @0.543，窗宽 FADE=0.3584
  .to(P2, { autoAlpha: 0, scale: 0.99, ease: "power1.inOut", duration: 0.3584 }, 0.5425)
  .to(P3, { autoAlpha: 1, scale: 1,    ease: "power1.inOut", duration: 0.3584 }, 0.5425)
// P3 dwell 到末尾，把 timeline duration 锚到 1.0
  .to(P3, { autoAlpha: 1, duration: 0.0991 }, 0.9009);
```

## data-speed 决策：**去除**

早期版本在书页层叠加 ScrollSmoother `data-speed` 视差。**本版移除**：

- 标准 pin-and-fade 不在被 pin 的层上叠 `data-speed`。
- `data-speed` 按滚动量偏移元素，在「被钉住」的 frame 内会**累积成漂移**
  （此前 P3 落到视口下方即此故障），与 timeline 抢夺 transform。
- 移除后架构更纯：单一时间线掌管一切，无第二套系统。

## 索引接管：**pin 释放后干净脱离**

- P3 在 pin 末尾保持满显；pin 释放 → frame 随页面自然上移滚走。
- `Marquee`（`— NATURALIST JOURNAL — MMXXVI —`）作为「开书成索引」缝合带。
- 索引段（`HeadlinePost` + `ScrollReveal` 列表）**始终在 pin 之外**，常规滚动，
  沿用现有 `ScrollReveal` 逐词显影，无改动。

## 文件改动计划（复用 vs 替换）

| 文件 | 处置 | 说明 |
|------|------|------|
| `ChapterStage.tsx` | **内部重写**（非结构重写） | pin-frame + 绝对叠层外壳保留；去掉 `.chapter-inner` 包层；时间线换成 `autoAlpha`+`scale` crossfade；加 `invalidateOnRefresh`。 |
| `SmoothScroll.tsx` | **保留**，改一处 | `effects: true → false`（不再需要 data-speed）；`smooth: 1.2` 惯性保留。 |
| `page.tsx` | **删属性** | 去掉 P2/P3 标题/副标题上的 `data-speed`；章节版式不变；索引段不变。 |
| `RevealText.tsx` | **不动** | |
| `Marquee.tsx` | **不动** | |
| `HeroZone.tsx`（`INK_ENABLED`） | **不动** | 墨层维持关闭。 |

> **当前不存在两套并存的转场逻辑**：现 `ChapterStage` 已是「单 timeline + pin」，
> 「每层独立 ScrollTrigger」在现码中并不存在，无需拆除——只做这一处内部重写。

## 死代码清理

- `.chapter-inner` 包层及其选择器 —— 移除（原本只为隔离 data-speed 与 y-tween）。
- `page.tsx` 中 `data-speed="0.6"/"0.9"` 标题/副标题属性 —— 移除。
- 旧的 y 偏移初始化（`y: 30`）与基于 y 的 tween —— 由 scale 取代。
- `SmoothScroll` 的 `effects:true` 及其注释 —— 回退 `false`。
- 常量 `TRAVEL_VH`（1.5）—— 改名 `TRAVEL`、取值 `2.6`。

## 降级与安全

| 条件 | 书页段 | 索引段 |
|------|--------|--------|
| 桌面 + 允许动效 | 完整 pin-and-fade crossfade | 逐词显影 |
| `prefers-reduced-motion` | 普通堆叠长页，无 pin / 无 fade | 直接显示，无显影 |
| SSR / 无 JS | 普通堆叠长页（定位仅在动效分支施加，静态内容独立可读） | 常规列表 |
| 策展内容不足（<2 页） | 单页直接显示，跳过 crossfade | 不受影响 |

- **pin 安全**：`INK_ENABLED=false`，无延迟挂载的 `InkCanvas` 兄弟节点，
  早期 pin-spacer `insertBefore` 隐患已解除。
- **ScrollSmoother 兼容**：pin 与 smoother 协同；平滑滚动保留，仅关闭 effects。
- **数据解耦**：书页策展内容独立于文章查询，不共享分页 / 排序状态。

## 决策记录（本次确认）

1. **去 data-speed** —— 换取干净的单时间线 crossfade，消除 pin 内漂移，杜绝第二套系统。
2. **3 页 · slow-paced ≈ 1310vh** —— 停留 28% / 过渡 72%，过渡窗 ≈468vh，停留 ≈139/102/129vh。
   过渡（渐融）是流动感来源；停留是静止段，过短会回到「PPT 切换」感，过长则页面「卡住」。
3. **opacity(`autoAlpha`) + 轻微 scale** —— scale 表「深度/浮现」，不用 y（避免「滑动」感）。
4. **索引在 pin 释放后干净脱离** —— `Marquee` 作缝合带，索引段始终在 pin 外常规滚动。

## 修订历史

1. **rotateY 翻页 + snap**（废弃）：3D 翻页、snap 收停。离散切换，PPT 硬切感。
2. **每层独立 ScrollTrigger 视差叠层**（废弃）：用 `sticky` 固定，在 ScrollSmoother 的
   transform 下失效，书页滚走 / P3 空白。
3. **pin-hold + 单 timeline + data-speed**（过渡态）：pin 修好了「固定」，但 data-speed
   在 pin 内漂移，且过渡窗过长导致「文字叠文字」。
4. **pin-and-fade crossfade（初版实现）**：去 data-speed，`autoAlpha`+scale，
   reading-paced ≈260vh，干净索引脱离。
5. **本版：慢速流动调参（确认）**：过渡窗放大到 ≈468vh、停留收短，过渡占 ~72%，
   总跨度 ≈1310vh——让「渐融」主导、连续流动，而非被静止停留切成 PPT 段。

## 排期

- **开发方式**：`feat/ink-layer` 分支当前阶段，确认 spec 后进入实现计划。
- **优先级**：可选增强；不阻塞 P0/P1/P2 主线。
