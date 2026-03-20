# Deployment Guide

This guide covers first-time and ongoing deployment of the OIDC IdP to Cloudflare Workers.

## Prerequisites

| Requirement        | Version | Notes                          |
| ------------------ | ------- | ------------------------------ |
| Node.js            | 18+     | Runtime for Wrangler + scripts |
| Wrangler CLI       | v4+     | `npm install -g wrangler`      |
| OpenSSL            | any     | Key generation                 |
| Cloudflare account | —       | Workers + D1 must be enabled   |

> If you're on the Cloudflare free plan, Workers and D1 are included. No billing required for development.

---

## First-Time Deployment

### Step 1: Clone and install

```bash
git clone https://github.com/your-org/setec-astronomy
cd setec-astronomy
npm install
```

### Step 2: Authenticate with Cloudflare

```bash
wrangler login
```

This opens a browser window to authorize Wrangler. Verify it worked:

```bash
wrangler whoami
```

### Step 3: Provision Cloudflare resources

The provisioning script handles everything in one step:

```bash
npm run provision
```

This script:

1. Creates the **D1 database** (`oidc-idp`)
2. Creates the **KV namespace** (`oidc-idp`) and preview namespace
3. **Patches `wrangler.toml`** with the real resource IDs automatically
4. Generates a **2048-bit RSA signing key** and uploads it as a Wrangler secret
5. Generates a **32-byte ADMIN_API_KEY** and uploads it as a Wrangler secret
6. Runs **D1 migrations** against the remote database

The script is idempotent — safe to re-run if something fails partway through.

> **Save the ADMIN_API_KEY printed at the end.** It is uploaded as a Cloudflare secret and cannot be retrieved again. You will need it to create users and OIDC clients.

#### Manual provisioning (alternative)

If you prefer to run steps individually:

```bash
# Create D1 database
wrangler d1 create oidc-idp
# → Copy the database_id into wrangler.toml

# Create KV namespace
wrangler kv namespace create oidc-idp
# → Copy the id into wrangler.toml [[kv_namespaces]]

# Create KV preview namespace (for wrangler dev)
wrangler kv namespace create oidc-idp --preview
# → Copy the id into wrangler.toml preview_id

# Generate and upload RSA key
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out signing.key
cat signing.key | wrangler secret put SIGNING_KEY_PRIVATE
rm signing.key

# Generate and upload admin key
openssl rand -hex 32 | wrangler secret put ADMIN_API_KEY

# Run migrations
wrangler d1 migrations apply oidc-idp --remote
```

### Step 4: Set your ISSUER URL

Open `wrangler.toml` and update the `ISSUER` variable to your Worker's public URL:

```toml
[vars]
ISSUER = "https://oidc-idp.your-subdomain.workers.dev"
```

The `ISSUER` value:

- Must exactly match your deployed Worker URL
- Appears in every JWT `iss` claim
- Appears in the OIDC discovery document
- Cannot be changed after issuing tokens without breaking existing integrations

To find your subdomain: `wrangler deploy --dry-run 2>&1 | grep workers.dev`

### Step 5: Deploy

```bash
wrangler deploy
```

### Step 6: Verify

```bash
WORKER_URL="https://oidc-idp.your-subdomain.workers.dev"

# Health check
curl "${WORKER_URL}/health"
# → {"status":"ok"}

# OIDC discovery document
curl "${WORKER_URL}/.well-known/openid-configuration" | jq .
# → {"issuer":"...","authorization_endpoint":"...","jwks_uri":"...",...}

# JWKS (public signing key)
curl "${WORKER_URL}/jwks.json" | jq .
# → {"keys":[{"kty":"RSA","use":"sig","alg":"RS256",...}]}
```

### Step 7: Create initial user and OIDC client

```bash
export ADMIN_API_KEY="<your-admin-api-key-from-step-3>"
export WORKER_URL="https://oidc-idp.your-subdomain.workers.dev"

# Create an admin user
curl -s -X POST "${WORKER_URL}/admin/users" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "change-me-in-production-123",
    "profile": {"name": "Admin", "groups": ["admins"]}
  }' | jq .

# Create an OIDC client for Cloudflare Zero Trust
curl -s -X POST "${WORKER_URL}/admin/clients" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "name": "Cloudflare Zero Trust",
    "redirect_uris": ["https://your-team.cloudflareaccess.com/cdn-cgi/access/callback"],
    "allowed_scopes": ["openid", "email", "profile"],
    "is_confidential": true
  }' | jq .
```

> **Save the `client_id` and `client_secret`** from the client response. The secret is hashed and cannot be retrieved from the API again.

### Step 8: Connect to Cloudflare Zero Trust

1. Open [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
2. Go to **Settings → Authentication → Login methods**
3. Click **Add new → OpenID Connect**
4. Fill in:

| Field               | Value                                       |
| ------------------- | ------------------------------------------- |
| **Name**            | My OIDC IdP (or any name)                   |
| **App ID**          | `client_id` from step 7                     |
| **Client Secret**   | `client_secret` from step 7                 |
| **Auth URL**        | `https://your-worker.workers.dev/authorize` |
| **Token URL**       | `https://your-worker.workers.dev/token`     |
| **Certificate URL** | `https://your-worker.workers.dev/jwks.json` |
| **PKCE**            | ✅ Enabled                                  |

5. Click **Save and Test**

---

## Updating a Deployment

### Code-only update (no migrations)

```bash
git pull
npm install
npm test          # Verify tests pass
wrangler deploy
```

### Update with new migrations

```bash
git pull
npm install
npm test
wrangler d1 migrations apply oidc-idp --remote
wrangler deploy
```

---

## Managing Secrets

List deployed secrets (names only — values are never shown):

```bash
wrangler secret list
```

Rotate the signing key (see [docs/key-rotation.md](key-rotation.md) for the full zero-downtime procedure):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | \
  wrangler secret put SIGNING_KEY_PRIVATE
wrangler deploy
```

Rotate the admin API key:

```bash
openssl rand -hex 32 | wrangler secret put ADMIN_API_KEY
wrangler deploy
```

---

## Checking Deployed Resources

```bash
# List D1 databases
wrangler d1 list

# Database size and status
wrangler d1 info oidc-idp

# List KV namespaces
wrangler kv namespace list

# List all deployed Workers
wrangler deployments list

# Tail live logs (useful for debugging)
wrangler tail
```

---

## Local Development

See [developer-guide.md](developer-guide.md) for local setup with `wrangler dev`.

Quick summary:

```bash
# Copy and fill in secrets
cp .dev.vars.example .dev.vars
# Edit .dev.vars — generate key with: openssl genpkey -algorithm RSA ...

# Apply migrations locally
npm run db:migrate:local

# Start dev server
npm run dev

# Seed test user + OIDC client
npm run seed
```

---

## Troubleshooting

### `wrangler deploy` fails: "D1 database not found"

The `database_id` in `wrangler.toml` does not match a real database in your account. Run `wrangler d1 list` to find the correct ID.

### "Invalid PKCS8 input" errors at runtime

The signing key in the `SIGNING_KEY_PRIVATE` secret is malformed or uses an unsupported format. Cloudflare Workers' WebCrypto API requires PKCS#8 PEM format. Re-generate with:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | \
  wrangler secret put SIGNING_KEY_PRIVATE
```

### Discovery document returns wrong `issuer`

The `ISSUER` variable in `wrangler.toml` does not match the actual Worker URL. Update `[vars] ISSUER` to the exact URL and redeploy.

### Admin API returns 401

The `x-admin-api-key` header value does not match the `ADMIN_API_KEY` secret. Use `wrangler secret list` to confirm the secret exists, then re-check your client configuration.
