# OIDC Demo App

A Cloudflare Worker that demonstrates the full operator workflow for the setec-astronomy IDP:

1. **Provision** — create a user in the IDP via the Admin API
2. **Protect** — put the demo app behind Cloudflare Zero Trust using the IDP
3. **Login** — authenticate with the provisioned credentials
4. **Verify** — see your identity claims (name, email, groups, sub) in the app

---

## Prerequisites

- setec-astronomy IDP deployed (see [docs/deployment.md](../../docs/deployment.md))
- Cloudflare Zero Trust application configured (see [docs/cloudflare-zero-trust-setup.md](../../docs/cloudflare-zero-trust-setup.md))
- `ADMIN_API_KEY` secret set on the IDP Worker

---

## Step 1: Provision a demo user

Before anyone can log in, you need to create a user in the IDP.

```bash
IDP_URL=https://your-idp-worker.workers.dev \
ADMIN_API_KEY=your-admin-secret \
./scripts/provision-user.sh
```

This calls `POST /admin/users` on the IDP and creates:

```json
{
  "email": "demo@example.com",
  "password": "DemoPass123!",
  "profile": {
    "name": "Demo User",
    "groups": ["users", "demo"]
  }
}
```

Override any defaults via environment variables:

```bash
IDP_URL=https://your-idp-worker.workers.dev \
ADMIN_API_KEY=your-admin-secret \
DEMO_EMAIL=alice@yourcompany.com \
DEMO_PASSWORD=SecurePass456! \
DEMO_NAME="Alice Smith" \
DEMO_GROUPS='["users","admins"]' \
./scripts/provision-user.sh
```

If the user already exists (409), the script exits cleanly — safe to run repeatedly.

---

## Step 2: Deploy the demo app

```bash
npm install
npm run deploy
```

The demo app URL becomes your Cloudflare Zero Trust application URL.

---

## Step 3: Configure Zero Trust

Follow [docs/cloudflare-zero-trust-setup.md](../../docs/cloudflare-zero-trust-setup.md) to:

1. Create a Zero Trust application pointing at this Worker
2. Set the identity provider to your IDP
3. Set an access policy (e.g., everyone, or email matches)

---

## Step 4: Log in

Navigate to the demo app URL. Zero Trust will redirect you to the IDP login page. Sign in with the provisioned email and password. The demo app displays your identity claims after authentication.

---

## Managing users

After initial setup, use the Admin API to manage who can log in:

```bash
# List all users
curl https://your-idp-worker.workers.dev/admin/users \
  -H "x-admin-api-key: $ADMIN_API_KEY"

# Deactivate a user (prevents login immediately)
curl -X PATCH https://your-idp-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"is_active": false}'

# Reset a user's password
curl -X PATCH https://your-idp-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"password": "NewSecurePassword1!"}'
```

See [docs/user-management.md](../../docs/user-management.md) for the full operator guide.
