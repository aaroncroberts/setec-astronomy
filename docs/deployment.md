# Deployment Guide

This guide covers the complete first-time deployment of the OIDC IdP to Cloudflare Workers.

## Prerequisites

- Cloudflare account with Workers and D1 enabled
- Wrangler CLI v4+: `npm install -g wrangler`
- OpenSSL for key generation

## Step 1: Clone and install

```bash
git clone https://github.com/your-org/setec-astronomy
cd setec-astronomy
npm install
```

## Step 2: Create Cloudflare resources

### D1 database

```bash
wrangler d1 create oidc-db
```

Output example:

```
✅ Successfully created DB 'oidc-db' in region WEUR
Created your new D1 database.

[[d1_databases]]
binding = "OIDC_DB"
database_name = "oidc-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `[[d1_databases]]` block into `wrangler.toml`.

### KV namespace

```bash
wrangler kv:namespace create oidc-kv
```

Output example:

```
[[kv_namespaces]]
binding = "OIDC_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Copy the `[[kv_namespaces]]` block into `wrangler.toml`.

## Step 3: Configure wrangler.toml

Update the placeholders with your actual resource IDs and your Worker's public URL:

```toml
name = "oidc-idp"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ISSUER = "https://oidc-idp.your-subdomain.workers.dev"

[[d1_databases]]
binding = "OIDC_DB"
database_name = "oidc-db"
database_id = "<your-d1-database-id>"

[[kv_namespaces]]
binding = "OIDC_KV"
id = "<your-kv-namespace-id>"
```

> The `ISSUER` value must exactly match the URL your Worker is deployed to.
> It appears in every JWT `iss` claim and in the discovery document.

## Step 4: Generate RSA signing key

```bash
# Generate 2048-bit RSA key in PKCS#8 format
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out signing.key

# Verify the key
openssl pkey -in signing.key -text -noout | head -5
```

**Keep `signing.key` secure and off your filesystem after uploading.**

## Step 5: Upload secrets

```bash
# Upload the RSA private key (paste the PEM when prompted, then Ctrl+D)
cat signing.key | wrangler secret put SIGNING_KEY_PRIVATE

# Set a strong admin API key (min 32 random characters recommended)
echo "$(openssl rand -hex 32)" | wrangler secret put ADMIN_API_KEY
```

**Record the `ADMIN_API_KEY` value — you will need it to create users and clients.**

## Step 6: Run database migrations

```bash
# Apply all migrations to the remote D1 database
wrangler d1 migrations apply oidc-db --remote
```

Output:

```
✅ Successfully applied 3 migrations to oidc-db.
```

## Step 7: Deploy

```bash
wrangler deploy
```

## Step 8: Verify deployment

```bash
# Check discovery document
curl https://your-worker.workers.dev/.well-known/openid-configuration | jq .

# Check JWKS
curl https://your-worker.workers.dev/jwks.json | jq .

# Health check
curl https://your-worker.workers.dev/health
```

## Step 9: Create initial user and client

```bash
export ADMIN_API_KEY="<your-admin-api-key>"
export WORKER_URL="https://your-worker.workers.dev"

# Create a user
curl -X POST $WORKER_URL/admin/users \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "change-me-in-production-123",
    "profile": {"name": "Admin", "groups": ["admins"]}
  }'

# Create an OAuth client for Cloudflare Zero Trust
curl -X POST $WORKER_URL/admin/clients \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "Cloudflare Zero Trust",
    "redirect_uris": ["https://your-team.cloudflareaccess.com/cdn-cgi/access/callback"],
    "allowed_scopes": ["openid", "email", "profile"],
    "is_confidential": true
  }'
```

**Save the `client_id` and `client_secret` from the client creation response. The secret is not stored in plain text and cannot be retrieved again.**

## Step 10: Register in Cloudflare Zero Trust

1. Open the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)
2. Navigate to **Settings → Authentication → Login methods**
3. Click **Add new** → **OpenID Connect**
4. Fill in the form:
   - **Name:** `My OIDC IdP` (any name)
   - **App ID:** `<client_id from step 9>`
   - **Client Secret:** `<client_secret from step 9>`
   - **Auth URL:** `https://your-worker.workers.dev/authorize`
   - **Token URL:** `https://your-worker.workers.dev/token`
   - **Certificate URL:** `https://your-worker.workers.dev/jwks.json`
   - **PKCE:** ✅ Enabled
5. Click **Save and Test**

## Local Development

Create `.dev.vars` in the project root (this file is gitignored):

```bash
cat > .dev.vars << 'EOF'
SIGNING_KEY_PRIVATE="-----BEGIN PRIVATE KEY-----
<paste your development key here>
-----END PRIVATE KEY-----"
ADMIN_API_KEY=local-dev-secret
ISSUER=http://localhost:8787
EOF
```

Run the local dev server:

```bash
npm run dev
```

Apply migrations locally:

```bash
wrangler d1 migrations apply oidc-db --local
```

## Updating

To deploy a new version:

```bash
git pull
npm install
npm test           # Verify tests pass
wrangler deploy
```

If migrations were added:

```bash
wrangler d1 migrations apply oidc-db --remote
```
