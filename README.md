# blog

工程级个人博客系统（pnpm + Turborepo monorepo）。

- 需求文档：[docs/prd.md](docs/prd.md)
- 技术铁律：[CLAUDE.md](CLAUDE.md)

## 结构

```
apps/web          Next.js 前端（占位，M0 落地）
apps/api          NestJS 后端（占位，M0 落地）
packages/shared   前后端共享类型与工具
docs/             PRD 等文档
```

## 命令

```bash
pnpm install
pnpm verify   # lint + typecheck + test
pnpm dev
```
