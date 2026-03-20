# Developer Guide

Local development setup for the Cloudflare OIDC IdP. Target: onboarded in under 10 minutes.

## Prerequisites

- Node.js 18+
- npm 9+
- [Wrangler CLI v4](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`
- A Cloudflare account (free tier is fine for local dev — Wrangler only needs it for login, local D1/KV don't require a real account)

## 1. Install dependencies

```bash
npm install
```

## 2. Set up secrets

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in:

- `SIGNING_KEY_PRIVATE` — an RSA-2048 private key in PEM format (PKCS#8)
- `ADMIN_API_KEY` — any strong random string

Generate a key pair:

```bash
# Generate PKCS#8 private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out private.pem
cat private.pem   # copy into .dev.vars
```

Or use the test key from `tests/unit/routes/token.test.ts` for local dev only (never in production).

## 3. Apply D1 migrations

```bash
npm run db:migrate:local
```

This creates a local SQLite database at `.wrangler/state/v3/d1/`. The `.wrangler/` directory is gitignored.

## 4. Start the dev server

```bash
npm run dev
```

The Worker starts at `http://localhost:8787`. Wrangler reads `.dev.vars` automatically.

Verify it's running:

```bash
curl http://localhost:8787/health
# → {"status":"ok"}

curl http://localhost:8787/.well-known/openid-configuration
# → OIDC discovery document
```

## 5. Seed test data

With the dev server running:

```bash
npm run seed
```

This creates:

- A test user (`dev@example.com` / `devpassword123`)
- An OIDC client with redirect URI `http://localhost:3000/callback`

The command prints the `client_id`, `client_secret`, and a ready-to-use `/authorize` URL with a PKCE challenge. Open the URL in a browser to walk through the full login flow.

Options:

```bash
npm run seed -- --email myuser@example.com --password mypassword
npm run seed -- --base-url http://localhost:9000   # different port
ADMIN_API_KEY=my-key npm run seed                  # explicit admin key
```

## 6. Unit tests

```bash
npm test                  # run all 142 unit tests
npm run test:watch        # watch mode for TDD
npm run test:coverage     # with coverage report
```

Unit tests use in-memory D1/KV mocks — no running server needed. Fast (~2–3s).

## 7. Integration tests

```bash
npm run test:integration
```

Integration tests run inside a real Miniflare Workers runtime (the same engine as `wrangler dev`). They apply migrations to an in-memory D1 and dispatch requests to the actual Worker code. No dev server needed.

A fresh RSA test key is included in `vitest.integration.config.ts` — it is safe to commit and is used only for local testing. Override with `SIGNING_KEY_PRIVATE` env var if needed.

## Project structure

```
src/
  crypto/       RSA key ops, PKCE, password hashing, random IDs
  db/           D1 repository functions (users, clients)
  kv/           Workers KV store abstraction (auth codes, sessions, state)
  middleware/   CORS, rate limiting, admin auth
  routes/       Route handlers (authorize, login, token, userinfo, logout, admin, discovery)
  schemas/      Centralized Zod validation schemas
  tokens/       JWT issuance and validation (RS256)
  router.ts     Hono app with all routes registered
  types.ts      Env binding types

tests/
  unit/         Vitest unit tests with in-memory mocks (fast)
  integration/  Vitest integration tests in Miniflare Workers runtime

migrations/     D1 SQL migrations (applied in order)
scripts/        Developer + deployment scripts (seed.ts, provision.sh)
docs/           Documentation
```

## npm scripts reference

| Script                     | Description                                                  |
| :------------------------- | :----------------------------------------------------------- |
| `npm run dev`              | Start local Worker with `wrangler dev`                       |
| `npm run db:migrate:local` | Apply D1 migrations to local SQLite                          |
| `npm run db:migrate`       | Apply D1 migrations to production D1                         |
| `npm run seed`             | Seed test user and OIDC client                               |
| `npm test`                 | Run unit tests                                               |
| `npm run test:integration` | Run integration tests (Miniflare)                            |
| `npm run test:coverage`    | Unit tests with coverage report                              |
| `npm run typecheck`        | TypeScript type checking                                     |
| `npm run lint`             | ESLint                                                       |
| `npm run format`           | Prettier (auto-fix)                                          |
| `npm run format:check`     | Prettier (check only, used in CI)                            |
| `npm run ci`               | Full CI gate: typecheck + lint + test                        |
| `npm run provision`        | Provision Cloudflare resources (D1, KV, secrets, migrations) |
| `npm run deploy`           | Deploy to Cloudflare Workers                                 |

## Troubleshooting

**`wrangler dev` fails with "Missing binding OIDC_DB"**
Run `npm run db:migrate:local` first. Wrangler needs the local D1 database to exist.

**`wrangler dev` fails with "Missing secret SIGNING_KEY_PRIVATE"**
Make sure `.dev.vars` exists and contains `SIGNING_KEY_PRIVATE`. Copy from `.dev.vars.example`.

**`npm run seed` fails with "fetch failed"**
The dev server must be running (`npm run dev`) before seeding.

**`npm run seed` fails with "401 Unauthorized"**
The `ADMIN_API_KEY` in `.dev.vars` doesn't match. Check that `ADMIN_API_KEY` in `.dev.vars` and the value used when calling `/admin/*` match. `npm run seed` reads `ADMIN_API_KEY` from the environment: `ADMIN_API_KEY=my-key npm run seed`.

**Integration tests fail with "Invalid PKCS8 input"**
The `TEST_SIGNING_KEY` in `vitest.integration.config.ts` must be a valid PKCS#8 PEM key (header: `BEGIN PRIVATE KEY`, not `BEGIN RSA PRIVATE KEY`). Generate a fresh one:

```bash
node -e "const {generateKeyPairSync}=require('crypto'); console.log(generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'}}).privateKey)"
```
