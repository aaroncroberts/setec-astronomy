# User Management Guide

This guide explains how users are stored in the IDP, how to manage their lifecycle via the Admin API, and the key design decisions operators need to understand.

---

## User model

Users are persisted in a Cloudflare D1 (SQLite) table with the following fields:

| Field           | Type    | Description                                                   |
| --------------- | ------- | ------------------------------------------------------------- |
| `id`            | string  | UUID v4, auto-generated at creation                           |
| `email`         | string  | Unique login identifier                                       |
| `password_hash` | string  | PBKDF2-SHA256, 100k iterations, stored as `salt_b64:hash_b64` |
| `is_active`     | 0 or 1  | Whether the user can log in (`1` = active, `0` = deactivated) |
| `profile_json`  | string  | JSON blob: `{ name?, groups?, ...extensible }`               |
| `created_at`    | integer | Unix timestamp (seconds) at creation                          |
| `updated_at`    | integer | Unix timestamp (seconds) of last modification                 |

The `password_hash` field is **never returned** by any Admin API endpoint. All other fields are returned as-is.

### The `profile_json` field

`profile_json` is a JSON string containing optional claims that are surfaced in OIDC tokens when the `profile` scope is requested:

```json
{
  "name": "Alice Smith",
  "groups": ["admins", "editors"]
}
```

- `name` → appears as the `name` claim in ID tokens and at `/userinfo`
- `groups` → appears as the `groups` claim; use these to drive authorization decisions in downstream apps

Both fields are optional. The field is extensible — you can add arbitrary keys and they will be stored, though they won't be surfaced as standard OIDC claims without code changes.

### Deactivation vs. deletion

| Operation      | Mechanism         | Effect                                                    | Reversible? |
| -------------- | ----------------- | --------------------------------------------------------- | ----------- |
| Deactivate     | `is_active = 0`   | User cannot log in; existing tokens expire naturally      | Yes         |
| Hard delete    | Row removed from DB | User cannot log in; record is permanently destroyed     | No          |

**Prefer deactivation over deletion** unless you have a specific reason to permanently remove the record (e.g., GDPR erasure request). Deactivation preserves audit history and is immediately reversible.

Active sessions in KV are **not invalidated** when a user is deactivated or deleted. They will expire naturally (24-hour TTL). To force immediate logout, you would need to also clear the session keys from KV directly (not currently exposed via API).

---

## Admin API — user endpoints

All admin endpoints require:

```
x-admin-api-key: <your-admin-api-key>
```

Requests without the header or with a wrong key return `401 Unauthorized`.

---

### POST /admin/users

Creates a new user.

```bash
curl -X POST https://your-worker.workers.dev/admin/users \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "secure-password-123",
    "profile": {
      "name": "Alice Smith",
      "groups": ["users", "admins"]
    }
  }'
```

**Request body:**

| Field            | Required | Description                                    |
| ---------------- | -------- | ---------------------------------------------- |
| `email`          | ✅       | Valid email address                            |
| `password`       | ✅       | Minimum 8 characters (hashed before storage)  |
| `profile`        | ❌       | Optional profile object                        |
| `profile.name`   | ❌       | Display name                                   |
| `profile.groups` | ❌       | Array of group names                           |

**Response: 201 Created**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com",
  "is_active": 1,
  "created_at": 1742500000,
  "updated_at": 1742500000,
  "profile_json": "{\"name\":\"Alice Smith\",\"groups\":[\"users\",\"admins\"]}"
}
```

---

### GET /admin/users

Lists all users with optional search and pagination.

```bash
# All users (default: limit=20, offset=0)
curl https://your-worker.workers.dev/admin/users \
  -H "x-admin-api-key: $ADMIN_API_KEY"

# Search by email or name fragment
curl "https://your-worker.workers.dev/admin/users?search=alice&limit=10&offset=0" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

**Query parameters:**

| Parameter | Default | Description                                      |
| --------- | ------- | ------------------------------------------------ |
| `search`  | (none)  | Filter by email or profile name (substring match) |
| `limit`   | 20      | Max results per page (1–100)                     |
| `offset`  | 0       | Number of records to skip                        |

**Response: 200 OK**

```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "alice@example.com",
      "is_active": 1,
      "created_at": 1742500000,
      "updated_at": 1742500000,
      "profile_json": "{\"name\":\"Alice Smith\",\"groups\":[\"admins\"]}"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

Results are ordered by `created_at` descending (newest first). `password_hash` is never included.

---

### GET /admin/users/:id

Fetches a single user by UUID.

```bash
curl https://your-worker.workers.dev/admin/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

**Response: 200 OK** — same shape as a single object from the list endpoint.

**Response: 404 Not Found**

```json
{ "error": "not_found", "error_description": "User not found" }
```

---

### PATCH /admin/users/:id

Partially updates a user. Only fields present in the request body are changed.

```bash
# Deactivate a user
curl -X PATCH https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"is_active": false}'

# Update display name and groups
curl -X PATCH https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"profile": {"name": "Alice Jones", "groups": ["editors"]}}'

# Reset password
curl -X PATCH https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"password": "new-secure-password-456"}'
```

**Request body (all fields optional, at least one required):**

| Field              | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `email`            | New email address                                        |
| `password`         | New password (minimum 8 chars; re-hashed before storage) |
| `is_active`        | `true` to reactivate, `false` to deactivate              |
| `profile`          | Replaces the entire profile object                       |
| `profile.name`     | Display name                                             |
| `profile.groups`   | Group memberships (replaces existing groups)             |

**Note:** `profile` is replaced wholesale, not merged. If you want to add a group without removing existing ones, fetch the current profile first, modify it, then PATCH with the full updated profile.

**Response: 200 OK** — updated user object (same shape as GET).

**Response: 400 Bad Request** — if the body is empty or contains no valid fields.

**Response: 404 Not Found** — if the user ID does not exist.

---

### DELETE /admin/users/:id

Hard-deletes a user permanently.

```bash
curl -X DELETE https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

**Response: 204 No Content** — user deleted.

**Response: 404 Not Found** — user not found.

> **Warning:** This is irreversible. Prefer `PATCH` with `{"is_active": false}` unless you specifically need to erase the record (e.g., GDPR erasure).

---

## Operator workflows

### Provisioning a new user

```bash
curl -X POST https://your-worker.workers.dev/admin/users \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "email": "newuser@yourcompany.com",
    "password": "TemporaryPass1!",
    "profile": { "name": "New User", "groups": ["users"] }
  }'
```

Send the user their email and temporary password via a secure channel. There is currently no self-service password reset flow — operators must use `PATCH` to update the password if needed.

### Offboarding a user (reversible)

```bash
# Deactivate — prevents login immediately, preserves record
curl -X PATCH https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"is_active": false}'
```

Existing active sessions will expire within 24 hours. The user cannot acquire new tokens once deactivated.

### Reassigning group membership

```bash
# First, fetch current profile to avoid overwriting other fields
curl https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY"

# Then PATCH with the full updated profile
curl -X PATCH https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"profile": {"name": "Alice Smith", "groups": ["admins", "editors"]}}'
```

### Resetting a user's password

```bash
curl -X PATCH https://your-worker.workers.dev/admin/users/$USER_ID \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"password": "NewSecurePassword1!"}'
```

The password is hashed server-side before storage. The plaintext is never persisted.

### Finding a user by email

```bash
curl "https://your-worker.workers.dev/admin/users?search=alice@example.com" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

---

## Security considerations

### API key protection

The `ADMIN_API_KEY` secret grants full control over all user accounts. Treat it like a root credential:

- Store it in a secrets manager, not in environment variables or source code
- Rotate it periodically via `wrangler secret put ADMIN_API_KEY`
- Audit all admin API calls (Cloudflare Workers Logs or Logpush)

### Password hashing

All passwords are hashed with PBKDF2-SHA256 at 100,000 iterations with a 16-byte random salt per user before storage. The plaintext password is never logged or persisted. Verification uses constant-time comparison to prevent timing attacks.

### Session invalidation

Deactivating or deleting a user does **not** immediately invalidate their active KV sessions. A deactivated user's existing session will continue to work until the 24-hour TTL expires. If you need immediate revocation:

1. Deactivate or delete the user via the API
2. Manually remove their session key(s) from Cloudflare KV (via the dashboard or `wrangler kv key delete`)

Session keys follow the pattern `session:{sessionId}` where `sessionId` is stored in the user's `sid` cookie.

### No self-service

This IDP is designed for operator-managed user populations. There is no self-service registration, password reset email, or profile editing UI. All lifecycle operations go through the Admin API using the `ADMIN_API_KEY`.
