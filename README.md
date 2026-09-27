# Cinema — Frontend

The customer-facing web client for the **Cinema Booking API** (`cinema-api`): browse movies and the day
schedule, pick seats on a live seat map, hold them for 15 minutes, pay, and see your tickets.

This is a **frontend only** — a Next.js app with no database and no backend of its own. Every piece of data
comes from the separate `cinema-api` Go service, which must be running for this app to do anything useful.
Admin screens are out of scope (admins use the API directly).

> **Status:** 1.0 — complete. The public catalog with a live seat map, sign-in with sessions shared by every tab,
> holding seats, checkout with the API's test card, tickets, "My bookings", and the list of signed-in devices; with
> an accessibility and performance pass (see [Accessibility](#accessibility) and [Performance](#performance)).

## What it shows

| Page              | What you see                                                                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | Now showing (the first movies) and today's showtimes by movie.                                                                                                                                                                                                                          |
| `/movies`         | Every movie, with "Load more" for the next pages.                                                                                                                                                                                                                                       |
| `/movies/<id>`    | A movie with its showtimes of the next two weeks, grouped by day.                                                                                                                                                                                                                       |
| `/schedule`       | One day's showtimes by movie: a two-week date strip (`?date=YYYY-MM-DD`) and a movie filter (`?movie=<id>`).                                                                                                                                                                            |
| `/showtimes/<id>` | The live seat map: pick up to 10 seats with the mouse or the keyboard (arrow keys, Home/End, PageUp/PageDown, Space), then "Continue" to hold them. A guest's pick waits in the tab while they sign in. Seats you hold show as yours. Canceled, started, and sold-out showtimes say so. |
| `/checkout/<id>`  | Your hold: the seats and total, a countdown to the end of the hold, the payment method (the API's local test card: pick how the payment should go), "Pay", and "Cancel hold". Signed-in users only.                                                                                     |
| `/bookings`       | My bookings: seats waiting for payment (with the time left), upcoming tickets (the soonest first), and past and canceled bookings, with "Load older bookings". Signed-in users only.                                                                                                    |
| `/bookings/<id>`  | The ticket once paid: a QR code of the booking, when, where, which seats, and the receipt; an unpaid booking leads back to its checkout and can be canceled here. Signed-in users only.                                                                                                 |
| `/login`          | Sign in; `?next=` (a path of this site) is where you go afterwards.                                                                                                                                                                                                                     |
| `/register`       | Create an account; you are signed in right after.                                                                                                                                                                                                                                       |
| `/account`        | Your profile and where you're signed in: each browser or device with a readable name, when it was last active, and "Sign out" for any other one; "Sign out" (this browser, every tab) and "Sign out everywhere" (every device). Signed-in users only.                                   |

While you hold seats, the header shows the time left and leads back to the checkout ("Seats held · 12:34"; on phones,
a strip under the header).

Times are the cinema's wall-clock times exactly as the API sends them (never converted to the browser's time
zone), and prices are formatted from the API's integer cents.

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
- **Catalog data (Cache Components).** Every page is a prerendered static shell (header, headings, skeletons)
  into which its catalog data streams at request time. `src/lib/api/server.ts` is the only place Server
  Components read the API: each read awaits `connection()` first, so **`next build` never calls the API** (CI has
  none), and is cached in the server's memory with `'use cache'` — movies for about a minute (`catalog`
  profile), the schedule and showtime headers for 10 seconds (`schedule` profile, like the API's own cache). The
  seat map is never cached by Next. A failed read replaces only its own section with a "Try again" card.
- **Live seat map.** The server renders the current map; the browser then polls it every 5 seconds while the
  tab is visible (TanStack Query), and again on focus. The API's weak `ETag` and `Cache-Control: no-cache` make
  the browser revalidate by itself, so an unchanged map is a bodyless `304` through the proxy. Seats that someone
  else takes leave the local selection with a notice. A stale map never sells a seat twice: the API decides.
- **Sign-in and sessions** and **booking and payment** (below).
- **Security headers.** A static CSP (no nonces, which would force every page to render per request and rule
  out prerendered shells), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer
  policy, and a restrictive `Permissions-Policy`. `img-src` allows any `https:` host because posters come from
  URLs that admins enter.
- **API types.** `src/lib/api/schema.d.ts` is generated from the API's `api/openapi.yaml` and committed; do not
  edit it by hand (see [Regenerating the API types](#regenerating-the-api-types)).

### Sign-in and sessions

The access token (a JWT, 15 minutes by default) lives **in the memory of each tab** — never in web storage, a
cookie, or the server-rendered HTML. The refresh token is the API's `cinema_refresh` cookie: `HttpOnly`,
`SameSite=Strict`, on `Path=/v1/auth`, rotated on every refresh, and backed by a session on the server. Next to it,
the front keeps a readable, non-secret hint cookie, `cinema_signed_in`, whose only job is to spare guests a refresh
call on every page load.

```
tab starts
  ├─ no cinema_signed_in hint ─────────▶ guest: no auth call at all
  └─ hint ─▶ "hello" to the other tabs ─▶ a signed-in tab answers with its token (no request)
                                      └─ no answer within 150 ms ─▶ refresh
refresh  (start-up · a call answered 401 · a timer shortly before expiry · the tab regains focus)
  one at a time per tab ─▶ Web Lock "cinema-auth", shared by all tabs ─▶ a peer refreshed meanwhile? take its token
  └─▶ POST /v1/auth/refresh {}
        200 ─▶ keep the token, schedule the next refresh, hand the token to the other tabs
        401 ─▶ the session is over: every tab signs out
        no answer, 5xx, 429 (after retries) ─▶ keep the session; the next call or focus tries again
```

- **Tabs share one session.** A `BroadcastChannel` carries tokens, sign-ins, and sign-outs between tabs, and every
  request that changes the refresh cookie (sign-in, refresh, sign-out) runs under one Web Lock, so they never race:
  N tabs whose tokens expire together make one refresh, and a sign-out never races a refresh. The API's 30-second
  grace window for a just-rotated refresh token is the safety net for browsers without Web Locks.
- **Calls.** Personal data goes through `api` (`src/lib/api/client.ts`), which adds the token, and on a `401`
  refreshes once and replays the same request (same body, same `Idempotency-Key`). Public data goes through
  `publicApi`, which never waits for a session.
- **Pages.** Signed-in-only pages render a skeleton while the tab checks its session, then send guests to
  `/login?next=…`; `/login` and `/register` send signed-in visitors on to `next`. If the API cannot be reached when a
  tab starts, it does not sign you out: private pages offer "Try again", and the tab retries on focus and when the
  browser comes back online.
- **Personal data is dropped** from the query cache whenever the signed-in user changes (sign-out, or another
  account signing in in another tab).

### Booking and payment

```
seat map ── Continue ──▶ guest? ── save the pick (sessionStorage) ──▶ /login?next=… ──▶ back: pick restored
                    └──▶ POST /v1/bookings  (Idempotency-Key per pick)
                           201 ─▶ /checkout/<id>          409 SEAT_UNAVAILABLE ─▶ seats flash "just taken", leave the pick
                           409 ACTIVE_BOOKING_EXISTS ─▶ "go to checkout" or "hold new seats instead" (cancel, then hold)
checkout ── Pay ──▶ store the attempt (key, method, token) ──▶ POST /v1/bookings/<id>/payments
                      200 ─▶ ticket    202 / PAYMENT_IN_PROGRESS ─▶ follow the booking (2 s → 10 s) until it settles
                      402, 503 ─▶ message, next attempt with a new key    no answer, 5xx ─▶ "Retry payment", same key
```

- **Holding seats.** "Continue" sends the pick with an `Idempotency-Key` tied to the exact seats: sending the same
  seats again after a lost answer (or after a `SEAT_BUSY` / `BOOKING_BUSY` answer, retried once by itself) reuses
  it, so a hold is never made twice; another pick gets a new key. Seats someone else took leave the pick with a
  notice. A viewer has one unpaid booking per showtime: the map shows its seats as theirs with the way to its
  checkout, and picking others asks whether to keep the hold or release it and hold the new pick.
- **Paying.** Every "Pay" is an attempt with its own key, stored in the tab's `sessionStorage` **before** it is sent.
  When the answer is lost (the connection drops, a timeout, a server error, or a reload), the same attempt is sent
  again — by "Retry payment", or by itself when the checkout opens again — and the API replays the first answer
  instead of charging twice. A declined card or an unavailable provider ends the attempt: the next one gets a new
  key. Changing the test card's outcome also starts a new attempt (the API refuses a key reused with another body).
- **Payment methods** come from `GET /v1/payment-methods`, and each method id maps to a form in a small registry
  (`src/components/checkout/payment-methods.tsx`). Only the API's local test provider exists: its form lists the
  test tokens on purpose. A method the API enables but this app does not know is listed as unsupported.
- **The countdown** runs to the hold's `expires_at` by the server's clock: the skew between this device and the
  server is measured from the `Date` header of the API's answers, so a device clock that is off does not matter. It
  warns in the last two minutes, and at zero the checkout closes at once (the API's worker releases the seats
  within seconds). A payment in flight (`202`) is followed by polling the booking, every 2 seconds at first and
  every 10 seconds later, for up to 3 minutes; the API's worker settles such payments within about 2.5 minutes by
  default.
- **Tabs stay in step.** Holding, canceling, and paying are announced on a second `BroadcastChannel`
  (`cinema-sync`, ids only), and the other tabs refetch what changed: the header's hold indicator, an open
  checkout, the seat map, "My bookings".

### My bookings and signed-in devices

- **Two lists behind one page.** Seats waiting for payment come from `GET /v1/bookings?status=pending,processing`
  (one request holds all of them; the header's hold indicator shares it). Everything else comes page by page from
  `GET /v1/bookings?status=paid,expired,canceled`, newest first, and is split on screen: paid tickets for showtimes
  that have not started ("Upcoming", the soonest first) and the rest ("Past & canceled"). No booking is listed twice.
- **The list follows its holds.** While a payment is in flight, or a hold is past its deadline and waiting for the
  API's worker, the unpaid list is asked again every 5 seconds; a booking that leaves it (paid, expired, canceled)
  makes the history reload, so it moves to its new group by itself.
- **Signed-in devices** come from `GET /v1/auth/sessions`. Each session's `User-Agent` becomes a readable name
  ("Safari on iPhone") through a small labeler (`src/lib/user-agent.ts`: the common browsers and systems, no parser
  library). Another device is signed out with `DELETE /v1/auth/sessions/<id>`: it can no longer refresh, and the API
  refuses its access token at once (while its Redis is up), so that browser drops to sign-in on its next request.
  This browser signs out with "Sign out", which also clears its tabs.

## Accessibility

The target is WCAG 2.2 AA. axe finds nothing on any page in either theme, with dialogs and menus open, or at a
phone's 320 CSS pixels, and one end-to-end spec books a ticket with the keyboard alone.

- **Keyboard.** "Skip to content" is the first stop on every page. The seat map is a single tab stop: the arrow keys,
  Home/End, and PageUp/PageDown move between seats, Space or Enter picks one. Menus and dialogs follow the WAI-ARIA
  patterns — arrow keys, Escape, focus kept inside while open and given back to what opened them. Every control shows
  a focus ring, and scroll padding keeps it clear of the sticky header.
- **Focus follows the page.** After a navigation, focus moves to the new page's main heading (Next's route announcer
  reads the new title as well); switching the day or the movie filter keeps focus on the control. When the control
  that had focus goes away with what changed on the page — "Pay" replaced by the payment's outcome, "Cancel hold" by
  the canceled booking — focus moves to the page's heading rather than falling back to the top of the document.
- **Screen readers.** Seats are toggle buttons with names like "Row C, seat 7, VIP, $15.00, available"; states and
  seat types never rely on colour alone (icons, the VIP seats' thick top edge, the wheelchair symbol). The hold
  countdown is a timer announced at 5, 2, and 1 minutes left; outcomes (a declined card, seats someone just took, more
  movies loaded) are announced; links styled as buttons remain links.
- **Motion.** With "reduce motion" set in the system, animations and transitions end at once: spinners and skeletons
  stand still, dialogs, menus, and toasts appear without zooming or sliding.
- **Contrast and reflow.** Both themes pass axe's contrast checks (light mode uses a darker amber than dark mode). At
  320 CSS pixels no page scrolls sideways; a wide hall scrolls inside its own frame.

## Performance

- **What the browser downloads.** Pages are prerendered shells, and the catalog is rendered on the server. The
  JavaScript a page loads first (the scripts its HTML references, gzip): about 200 KiB for the catalog pages and "My
  bookings", 210 KiB for the seat map, 220–245 KiB for sign-in, the account, checkout, and the ticket — roughly half
  of it React and Next.js themselves. Code that few visitors need loads when needed: the account menu once someone is
  signed in, the "you already hold seats here" dialog when it opens (fetched ahead for a viewer who holds seats
  there). The sign-in forms validate with Zod Mini.
- **Nothing jumps.** Loading skeletons have the pages' shapes, posters sit in fixed 2:3 frames over a drawn fallback,
  fonts are self-hosted by `next/font`, and what arrives only after the session check — the account menu, the hold
  strip on phones, the "You're holding" notice — is placed where it moves nothing already on screen. The main area
  is at least a screen tall, so content that arrives late never pushes the footer out of view. Measured Cumulative
  Layout Shift: 0.000 for the public pages on a desktop and on a phone, at most 0.03 for signed-in pages on a phone
  with a hold ("good" is at most 0.1).
- **The seat map at 1 000 seats**, the API's largest hall. Seats are memoised buttons, and a poll's answer is merged
  into the previous one (TanStack Query's structural sharing), so a poll re-renders only the seats that changed — none
  when nothing did, and then the answer is a bodyless `304` anyway. Picking a seat re-renders two. In Chromium with its
  CPU slowed down four times, a 1 000-seat map is on screen about 120 ms after its answer arrives, and the slowest
  click or key press takes about 100 ms to paint (Interaction to Next Paint, "good" is at most 200 ms).
- **Images.** Posters come from hosts that admins choose, so Next does not resize them (`unoptimized`); the first row is
  preloaded and the rest load lazily. The ticket's QR code is an inline SVG.

`tests/e2e/performance.spec.ts` measures the layout shifts and the large hall on every run and prints the numbers as
annotations (`pnpm exec playwright test tests/e2e/performance.spec.ts --reporter=list`). To look inside the bundles, run
`pnpm next experimental-analyze` (it builds on its own; do not run it under a running `pnpm start`, whose `.next` it
replaces).

## Production topology

The Next rewrite is the development and simple-deployment path. In production, put an edge proxy (Caddy,
nginx) in front of one public origin that sends `/v1/*` straight to the API and everything else to Next:

```caddyfile
cinema.example.com {
	# The API, straight: Caddy adds the client's address to X-Forwarded-For.
	handle /v1/* {
		reverse_proxy 127.0.0.1:8080
	}
	# Everything else: the Next server.
	handle {
		reverse_proxy 127.0.0.1:3001
	}
}
```

```nginx
server {
    listen 443 ssl;
    server_name cinema.example.com;
    # ssl_certificate …; ssl_certificate_key …;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location /v1/ { proxy_pass http://127.0.0.1:8080; }   # the API, straight
    location /    { proxy_pass http://127.0.0.1:3001; }   # the Next server
}
```

With that, set on the API `AUTH_COOKIE_SECURE=true` and `HTTP_TRUSTED_PROXIES` to the edge proxy's address (see
below), and on the front `NEXT_PUBLIC_APP_URL=https://cinema.example.com` and `API_ORIGIN` to where the Next server
reaches the API (Server Components read the catalog there).

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

The end-to-end tests run against the **real local API**, its seeded catalog, and its worker, so start `cinema-api`
first. They read showtimes from the API instead of assuming seed ids, and use tomorrow's showtimes so that they are
still bookable; the booking specs pick random showtimes and seats, so parallel specs rarely want the same seat.
Files from other hosts (the seed's poster URLs point at an image service) are answered with a blank image by the
specs' `test` fixture (`tests/e2e/support/test.ts`), so no spec waits on a third party. Set `E2E_BASE_URL` to test an
already running deployment instead of starting the dev server. Install the browser once with
`pnpm exec playwright install chromium`. On WSL or a fresh Linux, Chromium may also need system libraries:
`sudo pnpm exec playwright install-deps chromium`.

The specs register throwaway accounts (`e2e-<time>-<random>@example.com`) in the local database, and pay for some
seats of tomorrow's showtimes with the test card; the API has no way to delete either. A full run signs up and signs
in about 60 times, and with the API's default rate limits all of that counts against one per-address budget (30 per
minute, shared by every request through the proxy), so use an API with rate limits off for a full run. Four specs
depend on the API's settings and skip or adapt otherwise:

- "tabs whose tokens expire together make one refresh" needs tokens of at most 60 seconds (`JWT_TTL=30s`);
- "replaying an old refresh cookie" waits out the refresh grace window: `E2E_REFRESH_GRACE_SECONDS` (default `30`,
  the API's default `REFRESH_GRACE`);
- "a hold that runs out" needs holds of at most 60 seconds (`BOOKING_HOLD_TTL=30s`, it measures the length itself)
  and the worker;
- "a payment the provider does not answer" needs the worker and `E2E_PAYMENT_SETTLE_SECONDS`, how long the worker
  takes to settle such a payment (about `PAYMENT_GRACE` + `RECONCILER_INTERVAL`).

For a complete, repeatable run, start a second API and worker with test settings next to your usual ones, build the
front against that API, and point the specs at the build:

```bash
# in cinema-api (same database and Redis; its own ports):
set -a; . ./.env; set +a
HTTP_ADDR=:8081 METRICS_ADDR=:9092 JWT_TTL=30s REFRESH_GRACE=2s BOOKING_HOLD_TTL=30s \
  AUTH_IP_RATE_LIMIT_PER_MIN=0 LOGIN_EMAIL_RATE_LIMIT_PER_MIN=0 AUTH_REFRESH_RATE_LIMIT_PER_MIN=0 \
  BOOKING_RATE_LIMIT_PER_MIN=0 go run ./cmd/api
WORKER_METRICS_ADDR=:0 PAYMENT_GRACE=11s EXPIRER_INTERVAL=1s RECONCILER_INTERVAL=2s go run ./cmd/worker

# in cinema-front:
API_ORIGIN=http://localhost:8081 NEXT_PUBLIC_APP_URL=http://localhost:3002 pnpm build
API_ORIGIN=http://localhost:8081 pnpm exec next start -p 3002    # Server Components read API_ORIGIN at run time
E2E_BASE_URL=http://localhost:3002 E2E_REFRESH_GRACE_SECONDS=2 E2E_PAYMENT_SETTLE_SECONDS=15 pnpm exec playwright test
```

The test worker shares the database with your usual API: it also expires that API's overdue holds and settles its
stuck payments, which is what its own worker would do.

What the specs cover: `smoke` (security headers, the proxy, the theme), `catalog` (server rendering, the schedule,
picking seats, live updates, not-found pages, robots and sitemap), `auth` (sign-in and sessions across tabs and
devices), `booking` (holds, every payment path, seat races, expiry), `account` (my bookings, signed-in devices),
`a11y` (a keyboard-only booking, focus after navigations and dialogs, reduced motion, axe on dialogs, menus, phone
widths, and not-found pages), and `performance` (layout shifts, the 1 000-seat hall). axe runs on every page in both
themes.

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint:ci`, `typecheck`, `test`, and `build`. The end-to-end tests
need the API and run locally.

### Checking a release by hand

With the API and its worker running (`PAYMENT_LOCAL_ENABLED=true`) and `pnpm dev` (or a production build):

1. `/`, `/movies`, `/movies/<id>`, `/schedule?date=…` render on the server: view the source, the content is there.
2. On `/showtimes/<id>`, pick two seats as a guest → "Continue" → sign in → the seats are picked again.
3. Hold them → the checkout counts down; another browser's seat map shows them held within about 5 seconds.
4. Pay with `tok_declined` → a message, the hold stays payable; pay with `tok_success` → the ticket with its QR code.
5. Pay a new hold with `tok_timeout` → "Confirming your payment…" → settled by the worker.
6. Let a hold run out (`BOOKING_HOLD_TTL=30s` on the API) → the checkout closes, and the seats are free again.
7. DevTools: no token in `localStorage` or `sessionStorage`; cookies: `cinema_refresh` (`HttpOnly`, `Path=/v1/auth`)
   and the non-secret `cinema_signed_in` hint; every API call goes to this app's origin, under `/v1/`.
8. Two tabs: sign out in one → the other, on a private page, goes to sign-in.
9. `JWT_TTL=30s` and three tabs open → one `/v1/auth/refresh` per expiry, in all tabs together.
10. `/account` shows the sessions of two browsers; signing out the other one signs it out.
11. The theme toggle survives a reload; the whole booking works with the keyboard alone.
12. `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm test && pnpm run build && pnpm test:e2e`.

## Troubleshooting

- **Signing in seems to work, then you are signed out again at once** — the refresh cookie is not stored: the API
  sends it `Secure` (`AUTH_COOKIE_SECURE=true`, its default) and the app is served over plain `http://` other than
  `localhost`. See [the refresh-cookie invariant](#the-refresh-cookie-invariant).
- **`429 Too Many Requests` while signing in, or during the end-to-end tests** — through the Next rewrite every
  visitor counts against one per-address budget (30 sign-ins a minute by default). Wait a minute, or run the tests
  against an API with rate limits off (see [Testing](#testing)).
- **Every API call fails in a production build, but Server Components show data** — the `/v1` rewrite is fixed at
  build time: rebuild with the right `API_ORIGIN` (the server reads it at run time, the rewrite does not).
- **Posters do not show** — the Content-Security-Policy allows images from `https:` hosts only; a poster URL on plain
  `http://` is blocked, and the drawn fallback shows instead.
- **`next start` warns that it "does not work with output: standalone"** — expected; for production run
  `node .next/standalone/server.js` (see [Running a production build](#running-a-production-build)).

## Known limitations

- The seat map has rows and numbers only: the API describes no aisles, gaps, or geometry, so rows are centred.
- There is no push channel: seat changes appear within about 5 seconds (polling), and the schedule's seat counts
  can be up to 10 seconds old.
- Unknown movie and showtime ids show a "not found" page marked `noindex`, but with HTTP status `200`: with Cache
  Components the page shell streams before the data is read, and a real `404` would need an API call in
  `proxy.ts` on every request.
- Whether a showtime has started is judged by the server's clock when the page is rendered, and by the viewer's clock
  after that; the API has the final say when seats are held.
- Movies without a poster (or with a broken poster URL) get a designed fallback built from the title.
- The access token lives in one tab's memory: a reload with no other tab open costs one refresh call, and a browser
  whose `cinema_signed_in` hint cookie was deleted (but not its refresh cookie) looks signed out until the next
  sign-in.
- A signed-out access token stops working at once only while the API's Redis is up; otherwise it works until it
  expires (15 minutes by default), though it can no longer be refreshed.
- A payment attempt is remembered by the tab that made it (`sessionStorage`): a lost answer is recovered there, not
  from another tab or browser. The booking itself shows every tab where the payment stands.
- After 3 minutes the checkout stops following a payment in flight and says it will settle later; "Check again"
  asks once more.
- Only the API's local test payment provider exists, so the checkout shows its test tokens on purpose.
- The API lists bookings by when they were made, so a ticket bought long before many later bookings shows under
  "Upcoming" only once "Load older bookings" reaches it.
- Through the Next rewrite, every signed-in device shows the Next server's address (see
  [Client addresses and rate limits](#client-addresses-and-rate-limits)).

## Scripts

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `pnpm dev`          | Start the dev server (Turbopack) on `PORT`.                 |
| `pnpm build`        | Production build (`output: 'standalone'`).                  |
| `pnpm start`        | Start the production server on `PORT`.                      |
| `pnpm lint`         | ESLint with autofix.                                        |
| `pnpm lint:ci`      | ESLint without autofix (as CI runs it).                     |
| `pnpm typecheck`    | `next typegen` + `tsc --noEmit`.                            |
| `pnpm format`       | Prettier.                                                   |
| `pnpm format:check` | Prettier without writing (as CI runs it).                   |
| `pnpm test`         | Unit and component tests.                                   |
| `pnpm test:e2e`     | End-to-end tests.                                           |
| `pnpm api:types`    | Regenerate `src/lib/api/schema.d.ts` from the API contract. |

## Project structure

```
src/app/                  Routes (App Router); (site)/ = the site layout (header, the one <main>, footer), its pages and
                          error page; sitemap.ts, robots.ts; the not-found page for unknown addresses
src/components/ui/        shadcn primitives
src/components/providers/ theme and TanStack Query providers
src/components/layout/    site header and navigation, user menu (the account menu loads lazily), hold pill and strip,
                          footer, theme toggle, page layout, section error boundary, focus after navigations
src/components/auth/      guards, sign-out notices, the auth card and form message, the list of signed-in devices
src/components/catalog/   poster, movie card and grid, showtime chip, schedule list, date strip, movie filter
src/components/seat-map/  seat picker, seat map, seats, legend, selection summary, "you already hold seats" dialog
src/components/checkout/  booking summary, hold timer, payment-method registry and the test card, cancel hold
src/components/bookings/  booking card, ticket QR code, booking status badge, booking not found
src/hooks/                shared clocks (has a showtime started? hold countdowns), seat selection, holding seats,
                          paying, canceling, active bookings, focus (invalid fields, content that changed)
src/lib/api/              generated types (schema.d.ts), server reads (server.ts), browser clients (public.ts,
                          client.ts), problem parsing, error messages
src/lib/auth/             the session (session.ts), token store, hint cookie, broadcast channel, Web Lock,
                          ?next= checks, AuthProvider / useAuth
src/lib/queries/          TanStack Query keys and options; booking, payment, account, and session calls
src/lib/payments/         payment attempts (idempotency keys kept per tab), the local test tokens
src/lib/                  time and money formatting, catalog, seat-map, booking, and checkout logic, idempotency keys,
                          server-clock skew, the cinema-sync channel, per-tab storage, the user-agent labeler, forms,
                          logger, site constants
src/schemas/              Zod Mini schemas of the forms
src/test/                 test helpers (query client, fake tabs: BroadcastChannel, Web Locks, API; booking fixtures)
tests/e2e/                Playwright specs; support/ (accounts, booking helpers, the fixture that stubs other hosts)
next.config.ts            /v1 rewrite, security headers, Cache Components, standalone output
instrumentation.ts        server error logging, console masking in production
```
