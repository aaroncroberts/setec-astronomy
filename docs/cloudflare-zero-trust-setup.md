# Cloudflare Zero Trust Setup Guide

This guide walks through connecting the deployed OIDC IdP to Cloudflare Zero Trust as a Generic OIDC login method, and then protecting an application with it.

## Prerequisites

Before starting:

- The OIDC IdP is deployed and accessible (see [deployment.md](deployment.md))
- You have an `ADMIN_API_KEY` and can reach your Worker URL
- You have created at least one OIDC client via the Admin API (step 7 of deployment guide)
- You have the `client_id` and `client_secret` from that client

> If you haven't created the OIDC client yet, do it now:
>
> ```bash
> curl -s -X POST "https://your-worker.workers.dev/admin/clients" \
>   -H "x-admin-api-key: ${ADMIN_API_KEY}" \
>   -H "content-type: application/json" \
>   -d '{
>     "name": "Cloudflare Zero Trust",
>     "redirect_uris": ["https://your-team.cloudflareaccess.com/cdn-cgi/access/callback"],
>     "allowed_scopes": ["openid", "email", "profile"],
>     "is_confidential": true
>   }' | jq '{client_id, client_secret}'
> ```
>
> Replace `your-team` with your Cloudflare Access team name (visible in Zero Trust dashboard → Settings → Custom Pages).

---

## Part 1: Register the OIDC IdP in Zero Trust

### 1. Open Zero Trust

Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com) and select your account.

### 2. Navigate to Login Methods

In the left sidebar: **Settings → Authentication → Login methods**

### 3. Add a new provider

Click **Add new** → Select **OpenID Connect** from the provider list.

### 4. Fill in the provider form

| Field               | Value                                       |
| ------------------- | ------------------------------------------- |
| **Name**            | `My OIDC IdP` (or any descriptive label)    |
| **App ID**          | Your `client_id`                            |
| **Client Secret**   | Your `client_secret`                        |
| **Auth URL**        | `https://your-worker.workers.dev/authorize` |
| **Token URL**       | `https://your-worker.workers.dev/token`     |
| **Certificate URL** | `https://your-worker.workers.dev/jwks.json` |
| **PKCE**            | ✅ Enabled                                  |

> All four endpoint URLs derive from your `ISSUER`. Verify them against your discovery document:
>
> ```bash
> curl -s https://your-worker.workers.dev/.well-known/openid-configuration | \
>   jq '{authorization_endpoint, token_endpoint, jwks_uri, userinfo_endpoint}'
> ```

**Optional fields:**

| Field                     | Recommended value                          |
| ------------------------- | ------------------------------------------ |
| **Scopes**                | `openid email profile`                     |
| **Email attribute name**  | `email`                                    |
| **Groups attribute name** | `groups` (if you use group-based policies) |

### 5. Save and test

Click **Save**. Cloudflare will immediately attempt a discovery document fetch to validate the configuration. If it succeeds, you'll see the provider listed with a green status indicator.

If the test fails, see [Troubleshooting](#troubleshooting) below.

---

## Part 2: Protect an Application

With the IdP registered, you can now gate any application behind it.

### Create an Access Application

1. In the sidebar: **Access → Applications**
2. Click **Add an application**
3. Choose the application type:
   - **Self-hosted** — for apps running on your infrastructure (behind a Cloudflare Tunnel or public URL)
   - **SaaS** — for third-party SaaS apps (e.g., Grafana Cloud, Jira)

### Configure the Self-Hosted Application

| Field                  | Value                                      |
| ---------------------- | ------------------------------------------ |
| **Application name**   | `My App`                                   |
| **Session duration**   | 24h (adjust to your security requirements) |
| **Application domain** | `app.example.com` or `example.com/app`     |

### Add an Identity Provider

On the **Authentication** tab, under **Identity providers**:

- Deselect any providers you don't want
- Select your newly added OIDC IdP (`My OIDC IdP`)

### Add a Policy

Policies define who can log in. Click **Add a policy**:

| Field           | Value         |
| --------------- | ------------- |
| **Policy name** | `Allow users` |
| **Action**      | Allow         |

Under **Configure rules**, add at least one rule. Common patterns:

**Allow by email domain:**

```
Selector: Emails ending in
Value:    example.com
```

**Allow specific emails:**

```
Selector: Emails
Value:    alice@example.com, bob@example.com
```

**Allow by group claim** (requires `groups` in your user profile):

```
Selector: OIDC Claims
Claim:    groups
Value:    admins
```

> Group claims come from the `groups` field in the user's `profile_json` stored in D1. Set this when creating users:
>
> ```bash
> curl -s -X POST "${WORKER_URL}/admin/users" \
>   -H "x-admin-api-key: ${ADMIN_API_KEY}" \
>   -H "content-type: application/json" \
>   -d '{"email":"alice@example.com","password":"...",
>        "profile":{"name":"Alice","groups":["admins","developers"]}}'
> ```

Click **Save policy**, then **Save application**.

---

## Part 3: Test the Login Flow

### 3.1 Browser test

1. Open a private/incognito window
2. Navigate to your protected application URL
3. Cloudflare Access redirects you to the Zero Trust login page
4. Select **My OIDC IdP** (or it may be the only option)
5. You're redirected to `https://your-worker.workers.dev/authorize?...`
6. The IdP login form appears — enter your user's email and password
7. On success, you're redirected back through Zero Trust to your application

### 3.2 Verify claims in the Access JWT

After a successful login, Cloudflare issues its own JWT (the "CF_Authorization" cookie). You can inspect what claims it received from the IdP:

1. In Zero Trust: **Logs → Access**
2. Find your login event and click it
3. The detail view shows which claims were received

Alternatively, decode the `CF_Authorization` cookie value at [jwt.io](https://jwt.io) — it contains `email`, `name`, and any group claims passed from the IdP's ID token.

### 3.3 Manual PKCE flow test (no browser)

To test the full token exchange without a browser, use the verifier printed by `npm run seed`:

```bash
# 1. Get the authorize URL from npm run seed output, open it manually
#    (the seed script prints it — copy the full URL)

# 2. After login + redirect, capture the `code` query parameter from the callback URL

# 3. Exchange the code for tokens
curl -s -X POST "https://your-worker.workers.dev/token" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<code-from-redirect>" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=<your-client-id>" \
  -d "client_secret=<your-client-secret>" \
  -d "code_verifier=<verifier-from-seed-output>" | jq .

# 4. Inspect the ID token
curl -s "https://your-worker.workers.dev/userinfo" \
  -H "authorization: Bearer <access_token>" | jq .
```

Expected userinfo response:

```json
{
  "sub": "<user-uuid>",
  "email": "dev@example.com",
  "email_verified": true,
  "name": "Dev User",
  "groups": ["admin"]
}
```

---

## Part 4: Managing Users

### Create a user

```bash
curl -s -X POST "${WORKER_URL}/admin/users" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "initial-password-123",
    "profile": {"name": "Alice Smith", "groups": ["developers"]}
  }' | jq .
```

### List users

```bash
curl -s "${WORKER_URL}/admin/users" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" | jq .
```

### Update a user's profile (groups)

```bash
curl -s -X PATCH "${WORKER_URL}/admin/users/<user-id>" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -H "content-type: application/json" \
  -d '{"profile": {"name": "Alice Smith", "groups": ["developers", "admins"]}}' | jq .
```

### Deactivate a user

```bash
curl -s -X DELETE "${WORKER_URL}/admin/users/<user-id>" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}"
```

Deactivated users cannot log in. Their records are retained.

---

## Part 5: Rotating Secrets

### Rotate the OIDC client secret

The client secret cannot be updated in place — create a new client, update Zero Trust, then delete the old one:

```bash
# 1. Create a new client with the same redirect URIs
curl -s -X POST "${WORKER_URL}/admin/clients" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "name": "Cloudflare Zero Trust (new)",
    "redirect_uris": ["https://your-team.cloudflareaccess.com/cdn-cgi/access/callback"],
    "allowed_scopes": ["openid", "email", "profile"],
    "is_confidential": true
  }' | jq '{client_id, client_secret}'

# 2. Update the Zero Trust login method with the new client_id + client_secret
#    (Settings → Authentication → Login methods → Edit)

# 3. Test the new configuration with "Save and Test"

# 4. Delete the old client
curl -s -X DELETE "${WORKER_URL}/admin/clients/<old-client-id>" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}"
```

### Rotate the signing key

See [key-rotation.md](key-rotation.md) for the zero-downtime key rotation procedure. After rotating, the new public key appears automatically in `/jwks.json` — Zero Trust fetches JWKS on each token validation so no Zero Trust reconfiguration is needed.

---

## Troubleshooting

### "Save and Test" fails with "Failed to fetch discovery document"

- Verify `https://your-worker.workers.dev/.well-known/openid-configuration` is accessible
- Check that the Worker is deployed: `wrangler deployments list`
- Ensure the ISSUER in `wrangler.toml` matches the Worker URL exactly

### Login redirects to IdP but shows a blank or error page

- Check Worker logs: `wrangler tail`
- The `SIGNING_KEY_PRIVATE` secret may be missing or malformed: `wrangler secret list`

### Login succeeds but Cloudflare Access denies with "User not allowed"

- The user's email or groups don't match the Access policy rules
- Check the **Logs → Access** entry for which claim was evaluated
- Update the policy or the user's profile groups

### "invalid_client" error during token exchange

- The `client_secret` in Zero Trust does not match the stored hash
- Create a new client and update the Zero Trust configuration (see [Rotating Secrets](#rotate-the-oidc-client-secret))

### Tokens issued but `email_verified` is false

- Your Access policy may require verified email. The IdP sets `email_verified: true` for all users by default.
- Check the userinfo endpoint response directly to confirm

### Sessions expire unexpectedly

- The IdP issues access tokens with a 1-hour expiry and refresh tokens with a 30-day expiry
- Zero Trust has its own session duration (configured per-application) — the shorter of the two applies
- Adjust the **Session duration** in the Access Application settings
