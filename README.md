# Sunprime POS

Production bakery/retail point-of-sale monorepo: Next.js POS terminal, Express API, Expo mobile admin, and shared TypeScript contracts. Deploys to a self-managed Linux VPS behind Nginx with PM2 (no Vercel).

## Architecture

| Path | Role | Port |
|------|------|------|
| `apps/web-pos` | Next.js cashier + admin POS | 3000 |
| `apps/mobile-admin` | Expo admin app (phone) | — |
| `backend` | Express + TypeScript API | 4000 |
| `packages/shared` | Shared types, enums, Zod schemas, money/FIFO helpers | — |

- **Database:** Supabase Postgres. Only the backend uses `DATABASE_URL` + service-role key.
- **Auth:** Supabase Auth (email/password). Frontends send the JWT; the backend verifies it and enforces `admin` / `cashier` roles.
- Business logic (stock, FIFO credit settlement, receipt numbers, totals) lives **only** in the backend (+ pure helpers in `@sunprime/shared`).

## Prerequisites

- Node.js **22+**
- **pnpm 9** (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- A Supabase project (URL, anon key, service-role key, Postgres pooler `DATABASE_URL`)

## Setup

```bash
pnpm install
```

Copy env examples and fill in values:

```bash
cp backend/.env.example backend/.env
cp apps/web-pos/.env.example apps/web-pos/.env.local
cp apps/mobile-admin/.env.example apps/mobile-admin/.env
```

Apply schema and seed sample products/customer:

```bash
pnpm db:migrate
pnpm db:seed
```

Create your first user in Supabase Auth (Dashboard → Authentication → Users), then sign in via web-pos. The first `app_users` row is promoted to **admin** automatically.

## Build order

Build shared first, then backend, then web-pos (Turbo respects workspace dependency graph):

```bash
pnpm --filter=@sunprime/shared build
pnpm --filter=@sunprime/backend build
pnpm --filter=@sunprime/web-pos build
```

Or in one command (mobile-admin is **excluded** so RN React cannot conflict with Next.js React):

```bash
pnpm build
```

## Development

```bash
# API + shared watch + web POS
pnpm dev

# Individually
pnpm dev:backend
pnpm dev:web
pnpm dev:mobile
```

- Web POS: http://localhost:3000  
- API health: http://localhost:4000/health  

## Tests

Money math and FIFO credit allocation unit tests (Vitest):

```bash
pnpm test
```

## PM2 (Linux VPS)

After `pnpm build` on the server:

```bash
# From repo root
pm2 start ecosystem.config.cjs
pm2 save
```

Or start processes individually:

```bash
# Backend API on :4000
pm2 start backend/dist/index.js --name sunprime-api --cwd /path/to/SunprimePos/backend

# Web POS on :3000
pm2 start apps/web-pos/node_modules/next/dist/bin/next --name sunprime-web --cwd /path/to/SunprimePos/apps/web-pos -- start -p 3000

pm2 save
```

Point Nginx at:

- `/` → `http://127.0.0.1:3000` (web-pos)
- `/api/` → `http://127.0.0.1:4000/` (or proxy the API on a subdomain, e.g. `api.example.com` → `:4000`)

Set `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` to your public API URL.

## App features

### web-pos

1. **Sales (POS)** — keyboard-driven search → ↑↓ → Enter → qty → Enter → price → Enter → cart; cash change live; credit customer step; receipt `SALE RECEIPT` / `0722932780`
2. **Inventory** — search, add/edit (admin), stock adjust with reason
3. **Credit** — customers, debt orders with items, FIFO payments, settlement receipt
4. **Reports** — day or range: revenue, cost, profit, cash/credit split
5. **Reprint** — latest completed sales, print original receipt
6. **Users & Settings** — admin user/role management

### mobile-admin (admin JWT required)

1. Sales reports  
2. Credit management + FIFO payments  
3. Inventory stock adjust  
4. Stock valuation (buying + selling totals and per-product breakdown)

## Receipt format

Printed sale and settlement receipts use:

```
SALE RECEIPT
0722932780
```

followed by itemized lines, totals, and receipt number / timestamp. Styled for 58mm/80mm thermal width (monospace).
