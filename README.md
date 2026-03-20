# setec-astronomy — OIDC Identity Provider

A production-grade OpenID Connect 1.0 Identity Provider built on Cloudflare Workers. Implements the Authorization Code flow with PKCE (S256), RS256-signed JWTs, and persistent storage via Cloudflare D1 and KV.

## Features

- **OIDC Authorization Code + PKCE** — secure browser-based flows, public and confidential clients
- **RS256 JWT tokens** — ID tokens and access tokens signed with a managed RSA key pair
- **Cloudflare-native** — no servers; D1 (SQLite) for users/clients, KV for short-lived state
- **Zero Trust ready** — works as a Generic OIDC provider in Cloudflare Access
- **Admin API** — create users and OAuth clients via a secret-key-protected REST API
- **Rate limiting** — KV-backed per-IP brute-force protection on login
- **Enterprise security** — PBKDF2 password hashing, constant-time comparisons, CORS, strict Zod input validation

## Architecture

```
Browser / Client App
        │
        ▼
┌──────────────────────────────────────────┐
│          Cloudflare Worker               │
│                                          │
│  GET  /.well-known/openid-configuration  │
│  GET  /jwks.json                         │
│  GET  /authorize          ─────────────► │─► KV (state, sessions, auth codes)
│  GET  /login (HTML form)                 │
│  POST /login              ─────────────► │─► D1 (user lookup + verify)
│  POST /token              ─────────────► │─► KV (code exchange) + RS256 sign
│  GET  /userinfo           ─────────────► │─► D1 (user claims)
│  GET  /logout                            │
│                                          │
│  POST /admin/users        ─────────────► │─► D1 (create user)
│  POST /admin/clients      ─────────────► │─► D1 (create OAuth client)
└──────────────────────────────────────────┘
        │                     │
        ▼                     ▼
   Cloudflare D1           Cloudflare KV
   (users, clients,        (auth codes, state,
    refresh tokens)         sessions — short TTL)
```

## Prerequisites

- [Cloudflare account](https://cloudflare.com) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v4+
- Node.js 18+

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/setec-astronomy
cd setec-astronomy
npm install
```

### 2. Create D1 database and KV namespace

```bash
wrangler d1 create oidc-db
wrangler kv:namespace create oidc-kv
```

Copy the output IDs into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "OIDC_DB"
database_name = "oidc-db"
database_id = "<your-d1-id>"

[[kv_namespaces]]
binding = "OIDC_KV"
id = "<your-kv-id>"
```

### 3. Generate RSA signing key

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out signing.key
```

### 4. Configure secrets

```bash
# Paste the PEM content when prompted
wrangler secret put SIGNING_KEY_PRIVATE < signing.key

# A strong random string for the admin API
wrangler secret put ADMIN_API_KEY
```

Set the issuer in `wrangler.toml`:

```toml
[vars]
ISSUER = "https://your-worker-subdomain.workers.dev"
```

### 5. Run database migrations

```bash
wrangler d1 migrations apply oidc-db --remote
```

### 6. Deploy

```bash
wrangler deploy
```

### 7. Verify

```bash
curl https://your-worker.workers.dev/.well-known/openid-configuration | jq .issuer
```

## Usage

### Create a user

```bash
curl -X POST https://your-worker.workers.dev/admin/users \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"alice@example.com","password":"secure-password-123","profile":{"name":"Alice","groups":["users"]}}'
```

### Register an OAuth client (e.g. for Cloudflare Zero Trust)

```bash
curl -X POST https://your-worker.workers.dev/admin/clients \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "Cloudflare Zero Trust",
    "redirect_uris": ["https://your-team.cloudflareaccess.com/cdn-cgi/access/callback"],
    "allowed_scopes": ["openid", "email", "profile"],
    "is_confidential": true
  }'
```

**Save the `client_id` and `client_secret` from the response — the secret is shown only once.**

### Register in Cloudflare Zero Trust

1. Go to **Zero Trust → Settings → Authentication → Login methods**
2. Click **Add new** → **OpenID Connect**
3. Fill in:
   - **Issuer URL:** `https://your-worker.workers.dev`
   - **Client ID:** `<client_id from above>`
   - **Client Secret:** `<client_secret from above>`
   - **PKCE:** enabled
4. Click **Save and Test**

See [docs/cloudflare-zero-trust-setup.md](docs/cloudflare-zero-trust-setup.md) for screenshots.

## Development

```bash
# Run unit tests (142 tests, no external dependencies)
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Run with coverage
npm run test:coverage

# Run locally (requires .dev.vars — see docs/deployment.md)
npm run dev
```

## Documentation

| Document                                                   | Description                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| [docs/deployment.md](docs/deployment.md)                   | First deploy, secrets, migrations, Zero Trust registration  |
| [docs/admin-api.md](docs/admin-api.md)                     | Managing users and clients via the admin API                |
| [docs/user-management.md](docs/user-management.md)         | User model, lifecycle, deactivation vs. deletion, workflows |
| [docs/key-rotation.md](docs/key-rotation.md)               | RSA key rotation without downtime                           |
| [docs/cloudflare-oidc-idp.md](docs/cloudflare-oidc-idp.md) | Architecture, design decisions, threat model                |

## License

MIT
