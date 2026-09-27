# Cinema — Frontend

The customer-facing web client for the **Cinema Booking API** (`cinema-api`): browse movies and the day
schedule, pick seats on a live seat map, hold them for 15 minutes, pay, and see your tickets.

This is a **frontend only** — a Next.js app with no database and no backend of its own. Every piece of data
comes from the separate `cinema-api` Go service, which must be running for this app to do anything useful.
Admin screens are out of scope (admins use the API directly).

> **Status:** under construction. Sprint 0 (scaffold and guardrails) is done: the app shell, theme, security
> headers, the `/v1` proxy to the API, generated API types, and the test harnesses. The catalog, auth,
> booking, and account screens follow in later sprints.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, Cache Components) + React 19 + TypeScript (`strict`)
- [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com),
  [lucide-react](https://lucide.dev), [sonner](https://sonner.emilkowal.ski),
  [next-themes](https://github.com/pacocoursey/next-themes) (system default, designed dark-first)
- [TanStack Query v5](https://tanstack.com/query) for server state (seat-map polling, pagination, mutations)
- [openapi-typescript](https://openapi-ts.dev) + [openapi-fetch](https://openapi-ts.dev/openapi-fetch/): types
  generated from the API's OpenAPI contract, and a typed client
- [Zod](https://zod.dev) for form validation
- [Vitest](https://vitest.dev) + Testing Library + [MSW](https://mswjs.io) for unit and component tests;
  [Playwright](https://playwright.dev) + [axe](https://github.com/dequelabs/axe-core-npm) for end-to-end tests

No Docker, no database, no auth library.

## Getting started

### Prerequisites

- Node.js 22+ (CI runs on 26)
- [pnpm](https://pnpm.io) — the version is pinned in `packageManager`; `corepack enable` picks it up
- **`cinema-api` running and reachable**, with PostgreSQL and Redis. From the `cinema-api` directory, per its
  README: create, migrate, and seed the database once (`make db-create migrate-up seed`), then start
  `make run-api` and `make run-worker` (the worker expires holds and settles payments). Its local `.env` needs
  `PAYMENT_LOCAL_ENABLED=true` (the test card) and `AUTH_COOKIE_SECURE=false` (plain-HTTP development).
  Quick check:

  ```bash
  curl -i http://localhost:8080/readyz   # expect 200 {"status":"ok",…}
  ```

### Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

   | Variable              | Default                 | Description                                                                                                                                               |
   | --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `PORT`                | `3001`                  | Port of `pnpm dev` / `pnpm start` (loaded by `dotenv-cli`).                                                                                               |
   | `API_ORIGIN`          | `http://localhost:8080` | **Server-only** origin of the API. Used by the `/v1` rewrite (**fixed at build time**) and by Server Components (read at run time). Never `NEXT_PUBLIC_`. |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3001` | Public URL of this app (`metadataBase`, canonical and Open Graph URLs). Inlined at build time.                                                            |

   `.env` is git-ignored and wins over the fallbacks in the code.

3. Start the dev server:

   ```bash
   pnpm dev
   ```

   The app is at `http://localhost:3001`. Through the same origin, `http://localhost:3001/v1/movies` answers
   with the API's JSON.

## Architecture

```
browser (front origin, :3001)
  ├─ pages, RSC, assets ───────────────────────────▶ Next.js
  └─ fetch /v1/*  (same origin, relative) ──▶ Next rewrite ──▶ ${API_ORIGIN}/v1/*  (Go API)
Server Components ───────── fetch ${API_ORIGIN}/v1/*  (server-only, public data only)
```

- **Same-origin API.** `next.config.ts` rewrites `/v1/:path*` to `${API_ORIGIN}/v1/:path*`, so browser paths
  equal API paths and the refresh cookie's `Path=/v1/auth` matches without extra configuration. There is no
  CORS, and the Content-Security-Policy's `connect-src 'self'` doubles as a guard against browser code calling
  the API origin directly. No page route may start with `/v1`.
- **Rendering split.** The public catalog (movies, schedule, showtime pages) is server-rendered for SEO and a
  fast first paint. Everything personal is rendered on the client, because the access token lives only in
  browser memory.
- **Security headers.** A static CSP (no nonces, which would force every page to render per request and rule
  out prerendered shells), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer
  policy, and a restrictive `Permissions-Policy`. `img-src` allows any `https:` host because posters come from
  URLs that admins enter.
- **API types.** `src/lib/api/schema.d.ts` is generated from the API's `api/openapi.yaml` and committed; do not
  edit it by hand (see [Regenerating the API types](#regenerating-the-api-types)).

## Production topology

The Next rewrite is the development and simple-deployment path. In production, put an edge proxy (Caddy,
nginx) in front of one public origin that sends `/v1/*` straight to the API and everything else to Next.

### Running a production build

`pnpm build` writes a standalone server to `.next/standalone` (unless `VERCEL` is set). Set `API_ORIGIN` and
`NEXT_PUBLIC_APP_URL` **before** building: the rewrite target and the public URL are fixed by the build.

```bash
pnpm build
cp -r .next/static .next/standalone/.next/        # and `public/`, once the project has one
PORT=3001 HOSTNAME=0.0.0.0 API_ORIGIN=http://localhost:8080 node .next/standalone/server.js
```

`API_ORIGIN` is also read at run time by Server Components, so pass the same value to the server. `pnpm start`
still works for a quick local check, but Next warns that it is not meant for standalone output.

### Client addresses and rate limits

The API applies per-address rate limits (for example, 30 sign-in attempts per minute) and records each
session's address. It takes the client address from `X-Forwarded-For` only when the request comes from an
address listed in its `HTTP_TRUSTED_PROXIES`. The Next rewrite hop was checked (Next 16.3):

- It adds only `X-Forwarded-Host`. It does **not** add `X-Forwarded-For` with the browser's address.
- It passes a client's own `X-Forwarded-For` through **unchanged**.

So:

- **Never list the Next server in the API's `HTTP_TRUSTED_PROXIES`.** Anyone could then pick the address that
  their requests are counted against by sending a forged `X-Forwarded-For`.
- **Through the Next rewrite**, the API sees the Next server as the only client: every user shares one
  per-address rate-limit budget, and every session shows the Next server's address. This is fine for
  development.
- **In production**, route `/v1/*` from the edge proxy directly to the API, have the proxy append the client
  address to `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, Caddy's
  `reverse_proxy` sets it by default), and list only the edge proxy in `HTTP_TRUSTED_PROXIES`.

### The refresh-cookie invariant

The API marks the `cinema_refresh` cookie `Secure` according to its `AUTH_COOKIE_SECURE` setting (default
`true`). It must match the scheme users see:

| Front served over       | API `AUTH_COOKIE_SECURE` | Result                                                                  |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `https://…`             | `true`                   | works                                                                   |
| `http://localhost:3001` | `false`                  | works (development)                                                     |
| `http://localhost:3001` | `true`                   | works in Chrome and Firefox (localhost counts as secure), not in Safari |
| `http://…` (not local)  | `true`                   | the browser **drops** the cookie → a silent sign-in loop                |

## Regenerating the API types

When the API contract changes, regenerate the types from a sibling `cinema-api` checkout:

```bash
pnpm api:types                                          # reads ../cinema-api/api/openapi.yaml
CINEMA_API_SPEC=/path/to/openapi.yaml pnpm api:types    # or any other copy of the contract
```

Commit the regenerated `src/lib/api/schema.d.ts`. It is excluded from Prettier and ESLint.

## Testing

| Command         | What it runs                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm test`     | Vitest unit and component tests (jsdom), `src/**/*.test.{ts,tsx}`.                              |
| `pnpm test:e2e` | Playwright end-to-end tests in Chromium, `tests/e2e/`. Starts `pnpm dev` unless one is running. |

The end-to-end tests run against the **real local API** (and, from the booking sprint on, its worker), so start
`cinema-api` first. Set `E2E_BASE_URL` to test an already running deployment instead of starting the dev server.
Install the browser once with `pnpm exec playwright install chromium`. On WSL or a fresh Linux, Chromium may
also need system libraries: `sudo pnpm exec playwright install-deps chromium`.

CI (`.github/workflows/ci.yml`) runs `lint:ci`, `typecheck`, `test`, and `build`. The end-to-end tests need the
API and run locally.

## Scripts

| Command          | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `pnpm dev`       | Start the dev server (Turbopack) on `PORT`.                 |
| `pnpm build`     | Production build (`output: 'standalone'`).                  |
| `pnpm start`     | Start the production server on `PORT`.                      |
| `pnpm lint`      | ESLint with autofix.                                        |
| `pnpm lint:ci`   | ESLint without autofix (as CI runs it).                     |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit`.                            |
| `pnpm format`    | Prettier.                                                   |
| `pnpm test`      | Unit and component tests.                                   |
| `pnpm test:e2e`  | End-to-end tests.                                           |
| `pnpm api:types` | Regenerate `src/lib/api/schema.d.ts` from the API contract. |

## Project structure

```
src/app/                  Routes (App Router); (site)/ = public, server-rendered pages
src/components/ui/        shadcn primitives
src/components/providers/ theme and TanStack Query providers
src/components/layout/    site header, footer, theme toggle
src/lib/api/              generated API types (schema.d.ts)
src/lib/                  logger (secret masking), utils, site constants
tests/e2e/                Playwright specs
next.config.ts            /v1 rewrite, security headers, Cache Components, standalone output
instrumentation.ts        server error logging, console masking in production
```
