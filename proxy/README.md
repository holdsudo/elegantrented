# elegantrented-proxy

Serves the rental app at **joe-miz.com/elegantrented**.

The app, its D1 database and the gown photos live in the Cloudflare account for
`elegentrented@gmail.com`. `joe-miz.com` is a zone in a *different* Cloudflare
account, and a Worker route can only bind to a zone in its own account — so this
tiny Worker is deployed to the account that owns the domain, and forwards
everything under `/elegantrented` to the account that has the app.

The path is passed through unchanged. The app is built with a matching
`basePath`, so it already generates its own links with the prefix; nothing here
rewrites HTML.

## Deploying

From this directory, signed in to the Cloudflare account that owns joe-miz.com:

```bash
npx wrangler login          # the joe-miz.com account, NOT elegentrented@gmail.com
npx wrangler deploy
```

`wrangler whoami` should list joe-miz.com under the account's zones before you
deploy. If it doesn't, you're in the wrong account and the route will fail to
bind.

## After it's live

Point the app's canonical URLs at the domain, from the repo root:

```bash
npx wrangler d1 execute rental-ledger --remote \
  --command "UPDATE AppSetting SET value = 'https://joe-miz.com' WHERE key = 'siteUrl';"
```

`siteUrl` holds the **origin only** — `siteBase()` appends `/elegantrented`, so
sitemap, robots and the schema.org blocks all follow automatically.

## Note on the route pattern

`joe-miz.com/elegantrented*` also matches any other path that merely starts with
that string (`/elegantrented-anything`). Nothing else on the domain uses the
prefix today; keep it in mind before adding a Pages site that would.
