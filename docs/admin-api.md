# Admin API Guide

The admin API allows privileged management of users and OAuth clients.
All endpoints require an `x-admin-api-key` header with the value configured as the `ADMIN_API_KEY` Worker secret.

## Authentication

All admin requests must include:

```
x-admin-api-key: <your-admin-api-key>
```

Requests without the header or with a wrong key return `401 Unauthorized`.

---

## POST /admin/users

Creates a new user account.

### Request

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

### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | ✅ | Must be a valid email address |
| `password` | string | ✅ | Minimum 8 characters |
| `profile` | object | ❌ | Optional user profile |
| `profile.name` | string | ❌ | Display name (appears in `name` claim) |
| `profile.groups` | string[] | ❌ | Group memberships (appear in `groups` claim) |

### Response: 201 Created

```json
{
  "id": "01HXXXXXXXXXXXXXXXXXX",
  "email": "alice@example.com",
  "is_active": 1,
  "created_at": "2026-03-20T12:00:00.000Z",
  "profile_json": "{\"name\":\"Alice Smith\",\"groups\":[\"users\",\"admins\"]}"
}
```

The `password_hash` is never returned.

### Errors

| Status | `error` | Cause |
|--------|---------|-------|
| 400 | `invalid_request` | Invalid email, short password, or malformed JSON |
| 401 | `unauthorized` | Missing or wrong `x-admin-api-key` |

---

## POST /admin/clients

Registers a new OAuth 2.0 / OIDC client. **The `client_secret` is returned only once in this response** and is never retrievable again.

### Request

```bash
curl -X POST https://your-worker.workers.dev/admin/clients \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "My Application",
    "redirect_uris": [
      "https://app.example.com/callback",
      "http://localhost:3000/callback"
    ],
    "allowed_scopes": ["openid", "email", "profile"],
    "is_confidential": true
  }'
```

### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Human-readable client name |
| `redirect_uris` | string[] | ✅ | Allowed redirect URIs (must be valid URLs) |
| `allowed_scopes` | string[] | ✅ | Must include `openid`; may include `email`, `profile` |
| `is_confidential` | boolean | ❌ | Default `true`. Set `false` for public clients (no secret) |

### Response: 201 Created

```json
{
  "client_id": "01HXXXXXXXXXXXXXXXXXX",
  "client_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "My Application",
  "redirect_uris": ["https://app.example.com/callback"],
  "allowed_scopes": ["openid", "email", "profile"],
  "is_confidential": true,
  "created_at": "2026-03-20T12:00:00.000Z"
}
```

**Save `client_secret` immediately. It is stored as a bcrypt hash and cannot be recovered.**

### Errors

| Status | `error` | Cause |
|--------|---------|-------|
| 400 | `invalid_request` | Missing `openid` scope, invalid redirect URI, missing name |
| 401 | `unauthorized` | Missing or wrong `x-admin-api-key` |

---

## Claims Reference

The IdP issues the following claims in ID tokens and at the `/userinfo` endpoint based on granted scopes:

| Scope | Claims |
|-------|--------|
| `openid` | `sub`, `iss`, `aud`, `exp`, `iat` |
| `email` | `email`, `email_verified` |
| `profile` | `name`, `groups` |

---

## Scopes

| Scope | Description |
|-------|-------------|
| `openid` | **Required.** Base OIDC scope; enables ID token issuance |
| `email` | Returns `email` and `email_verified` claims |
| `profile` | Returns `name` and `groups` claims from the user's profile |

---

## Error format

All errors follow RFC 6749:

```json
{
  "error": "invalid_request",
  "error_description": "Human-readable explanation"
}
```
