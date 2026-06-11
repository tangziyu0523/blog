---
name: nextjs
description: Naturalist Journal 前端设计规范 — 配色、字体、分类标注、装饰插图、分隔线约定。在 apps/web 做任何 UI / 页面 / 组件时使用。
---

# Naturalist Journal — 前端设计规范

## 核心原则

UI 单色极简，色彩完全由博物学插图承载。只有浅色模式，无深色模式。

## 色彩

| 用途 | 值 |
|------|-----|
| 页面背景 | `#FDFAF5` |
| 卡片表面 | `#FFFFFF` |
| 次级表面 | `#F8F3EC` |
| 主文字 | `#1C1917` |
| 次文字 | `#7A6E66` |
| 淡文字 | `#B0A49A` |
| 边框 | `#E8E0D4` |

## 字体（Google Fonts）

| 角色 | 字体 |
|------|------|
| 标题 | Playfair Display 600 |
| 正文 | Lora 400 |
| UI / 导航 / 日期 | Inter 400/500 |
| 代码 | JetBrains Mono |

## 分类标注

不用彩色，用 Lora 斜体小字，如：

> *系统编程 · 8 min read*

## 装饰插图

- **位置**：文章卡片右上角、页眉、章节分隔线。
- **形式**：React 组件，接受 `width` / `height` / `className` props。
- **来源文件**：`apps/web/public/illustrations/`
- **组件**：`apps/web/src/components/illustrations/`（从 `@/components/illustrations` 导入）。
  装饰用途，渲染时 `alt=""` + `aria-hidden`，屏幕阅读器跳过。

## 分隔线

居中斜体小字：

> ✦ *Naturalis Historia* ✦

## 未来增强（不要现在实现）

`docs/future/ink-interaction-spec.md` 里有水墨 WebGL 交互层规格，
最后阶段单独实现，现在忽略。
