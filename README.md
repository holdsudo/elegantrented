# Rental Ledger

A booking ledger for a gown rental shop. Seven fields per rental, numbered gowns
behind them, and a double-booking check so the book can't contradict itself.

Runs entirely on Cloudflare's free tier — one vendor, one account, no card. See
`SCOPE.md` for the spec and `scope.html` for the readable version.

| Piece | Cloudflare service | Free allowance |
|---|---|---|
| The app | Workers (via OpenNext) | 100k requests/day |
| The data | D1 (SQLite) | 5 GB, 5M row reads/day |
| The photos | D1, alongside the data | ~70,000 at the size the browser produces |

Measured Worker size: **1.02 MiB gzipped** against a 3 MiB limit.

---

## Running it locally

Local development uses the same bindings as production, emulated on your machine —
so `next dev` exercises the real D1 code paths, not a stand-in.

```bash
cd ~/dress-crm
npm install
npm run db:local          # create the tables in the local D1
SEED_DEMO=1 SEED_ADMIN_EMAIL=admin@local SEED_ADMIN_PASSWORD=changeme123456 \
  npm run seed:sql > seed.sql
npx wrangler d1 execute rental-ledger --local --file=seed.sql
npm run dev               # http://localhost:3400
```

Local data lives in `.wrangler/state`. Delete that folder to start over.

---

## Deploying

### 1. Create the two Cloudflare resources

```bash
npx wrangler login
npx wrangler d1 create rental-ledger      # copy the database_id it prints
```

Paste the `database_id` into `wrangler.jsonc`.

R2 would be a better home for photos, but Cloudflare requires a card on file to
enable it. Photos live in D1 instead. To switch later: enable R2, create the
bucket, uncomment the `r2_buckets` block in `wrangler.jsonc`. Photos already in
D1 keep working — every row records how it was stored.

### 2. Create the tables

```bash
npm run db:remote
```

### 3. Set the one secret

```bash
npx wrangler secret put SESSION_SECRET     # paste `openssl rand -base64 32`
```

The app refuses to boot in production without it, rather than signing sessions
with a constant that lives in source control.

### 4. Make the first login

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='<12+ characters>' \
  npm run seed:sql > seed.sql
npx wrangler d1 execute rental-ledger --remote --file=seed.sql
rm seed.sql        # it contains a password hash
```

### 5. Deploy

```bash
npm run deploy
```

Omit `SEED_DEMO=1` in step 4 and you get a clean book with no demo rows.

### Backups

D1 has no automatic backups on the free plan, and this app is the only record of
who owes money. Run nightly from `crontab -e`:

```bash
cd ~/dress-crm && npx wrangler d1 export rental-ledger --remote \
  --output ~/rental-backups/ledger-$(date +\%F).sql
```

---

## How it's put together

```
prisma/schema.prisma     schema of record — 8 tables. Not used at runtime; it
                         only generates migration SQL via `npm run db:sql`.
migrations/0001_init.sql applied with wrangler
wrangler.jsonc           the D1 binding (and R2, commented out)
src/lib/
  d1.ts                  the D1 binding, typed helpers, date/id conventions
  queries.ts             every SQL statement in the app, as domain functions
  enums.ts               the unions that replaced Postgres enums
  rentals.ts             double-booking check, balances, rental numbering
  dates.ts               calendar days, pinned to UTC
  money.ts               integer cents in, formatted strings out
  photo-storage.ts       photos in D1, or R2 when a bucket is bound
  rate-limit.ts          login throttling, counted in the database
  settings.ts            brand name, offsets, currency — all runtime
src/app/(app)/           ledger, rentals, gowns, calendar, money, settings
src/app/api/photos/[id]  serves gown photos (session-gated)
src/app/api/export       CSV of the current ledger view (session-gated)
```

### Things worth knowing

- **Money is integer cents** everywhere. `money.ts` is the only place it converts.
- **Dates are calendar days**, normalised to UTC midnight in `dates.ts`. This is
  why the move from Postgres to SQLite changed no behaviour — the app never
  relied on a database date type.
- **No ORM.** Prisma cannot run on Cloudflare Workers: its query compiler ships
  as WebAssembly that neither webpack nor wrangler place where the runtime can
  read it (opennextjs-cloudflare#471, prisma#27486). `queries.ts` talks to D1
  directly, which is the supported path and about 300 lines.
- **Dates are stored as ISO-8601 UTC text.** Every value has the same fixed
  width, so SQLite's lexicographic comparison is also chronological — which is
  why `WHERE partyDate >= ?` behaves exactly as it did under Postgres.
- **SQLite has no enums.** `enums.ts` holds the unions and the parse functions;
  every write goes through one, so a hand-crafted form post can't store garbage.
- **Rental numbers come from a Counter row**, because SQLite only autoincrements
  a primary key. `increment` compiles to a single UPDATE, so two simultaneous
  saves can't collide.
- **No `mode: "insensitive"`** in queries — SQLite rejects it, and its LIKE is
  already case-insensitive for ASCII.
- **"Paid" is a ledger column backed by a payment table.** Typing a new total
  appends the difference as a payment, so the familiar single field still leaves
  a real history behind it.
- **Server actions reset the form** in React 19. Actions that reject a submit
  echo the submitted values back and the fields remount from them — otherwise a
  double-booking warning would cost someone everything they typed.
- **Photos are downscaled in the browser** (1600 px, JPEG q0.82) before upload.
  Measured: a 4200 px, 370 KB image becomes 50 KB.

---

## What isn't built

The parked list in `SCOPE.md` §9 — sizes as variants, cleaning workflow,
measurements, group orders, alterations, deposits, a payment processor, the public
storefront. Each layers onto this without a rewrite.
