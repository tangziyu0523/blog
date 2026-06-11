# Next.js 16.2.9 — verified API reconnaissance (Task 8)

> Source: the **installed** type definitions under
> `node_modules/.pnpm/next@16.2.9_*/node_modules/next/...`, NOT training data.
> `apps/web/AGENTS.md` points at `node_modules/next/dist/docs/` — that directory
> **does not exist** in this install; the authoritative source is the `.d.ts`
> files + the generated `apps/web/.next/types/`. Use these facts for Tasks 9–15.

## 1. Dynamic route `params` is a Promise (BREAKING vs older Next)

`apps/web/.next/types/validator.ts` types a page's default export as:
`{ params: Promise<ParamMap[Route]> } & any`. So for `app/posts/[slug]/page.tsx`:

```tsx
export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // ...
}
```

`searchParams` is likewise `Promise<Record<string, string | string[] | undefined>>`.
A global `PageProps<'/posts/[slug]'>` helper also exists (typed routes), but the
explicit `{ params: Promise<{ slug: string }> }` shape validates fine (`& any`).

In **client** components that need the param, use the `use()` hook to unwrap the
promise (Task 15 edit route): `const { id } = use(params);`.

## 2. Typed routes are ENABLED — watch dynamic hrefs at build time

`apps/web/.next/types/routes.d.ts` is auto-generated with `type AppRoutes = "/"`
(only the scaffold route exists today). As we add `/login`, `/posts/[slug]`,
`/editor/new`, `/editor/[id]`, those join `AppRoutes` after a build.

Implication/gotcha: `<Link href={`/posts/${slug}`}>` and
`router.push(`/posts/${slug}`)` are checked against generated routes. If the TS
build complains about a dynamic href, the fix is to make sure the target route
file exists (so it's in `AppRoutes`) — don't reach for `as any`. Verify each
frontend task with `pnpm --filter @blog/web build`, which runs the type
validator over `.next/types`.

## 3. `next/font/google` — classic loader API (unchanged)

`next/font/google` exports a function per family, e.g.:

```ts
import { Playfair_Display, Lora, Inter, JetBrains_Mono } from "next/font/google";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600"], variable: "--font-display" });
const lora     = Lora({ subsets: ["latin"], weight: ["400"], variable: "--font-body" });
const inter    = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-ui" });
const mono     = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
```

`weight` accepts a single string or an array of the family's supported weights
(TS will reject an unsupported weight at build). Apply `className={playfair.variable}`
to `<body>`/`<html>`.

## 4. `next/navigation` exports (App Router)

Confirmed in `dist/client/components/navigation.d.ts` + `not-found.d.ts` + `redirect.d.ts`:
- `useRouter(): AppRouterInstance` (client) — `router.push(...)`, `router.replace(...)`
- `useParams()`, `usePathname()`, `useSearchParams()`
- `notFound(): never` (server or client) — used in the detail page
- `redirect(...)`, `permanentRedirect(...)`

## 5. Other

- `'use client'` is still the directive; Server Components are the default.
- `next/link` and `next/image` have default exports (standard usage).
- React 19.2.4 — `use()` hook available for unwrapping promises in client components.

## 6. API origin for the web app

`apps/api/src/config/env.validation.ts`: `PORT: z.coerce.number().default(3001)`.
So the API listens on **3001**. `apps/web/.env.example` correctly sets
`NEXT_PUBLIC_API_URL=http://localhost:3001`. The API has CORS enabled for
`WEB_ORIGIN` with `credentials: true` (cookies work cross-origin).
