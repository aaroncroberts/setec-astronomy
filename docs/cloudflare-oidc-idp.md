# Design Guide: Custom OIDC Identity Provider on Cloudflare Workers

## Overview

This document specifies a complete design for implementing a custom OpenID Connect (OIDC) 1.0 Identity Provider (IdP) that runs entirely on Cloudflare (Workers plus supporting services) and is consumable as a **Generic OIDC** provider in Cloudflare One / Zero Trust.[web:5][web:50] It is written as a build guide for an implementation agent that will create the solution in TypeScript targeting Cloudflare Workers.

The IdP exposes the standard OIDC discovery document and endpoints (authorization, token, userinfo, JWKS) and is designed to be **almost stateless at the edge**, using Cloudflare D1 for durable data, Workers KV for short‑lived state, and optional Durable Objects if stronger consistency is required.[web:5][web:23]

## Scope and Goals

### Primary Goals

- Provide an OIDC 1.0–compatible Identity Provider hosted on Cloudflare Workers.
- Support Authorization Code Flow with PKCE for browser-based and backend applications.[web:5]
- Allow Cloudflare Zero Trust to register this IdP via the **Generic OIDC** integration and use it to authenticate users for self‑hosted apps and SaaS apps.[web:5][web:8]
- Support multiple OIDC clients (multi‑tenant: multiple apps) with per‑client redirect URIs and scopes.
- Provide a minimal user directory (email/password) stored in D1, with an option to plug in an external identity backend later.

### Non‑Goals (for the initial version)

- No social login aggregation (Google, GitHub, etc.) in v1; only first‑party accounts.
- No full SCIM provisioning implementation in v1 (out of scope, can be added later for group sync).[web:5]
- No advanced consent UI (simple, implicit consent for configured scopes).

## Cloudflare Platform Components

The solution must use only Cloudflare-managed services: Workers, KV, D1, Durable Objects (optional), and Access/Zero Trust.[web:50][web:18]

### Required Components

- **Cloudflare Workers**
  - One Worker project (e.g., `oidc-idp`) handling all HTTP routes.
  - Written in TypeScript using the official Workers TypeScript tooling and types.[web:18]

- **Cloudflare D1 (SQLite)**
  - Persistent relational storage for users, clients, and issued refresh tokens.[web:37]

- **Cloudflare Workers KV**
  - Short‑lived state and cache:
    - Authorization codes.
    - PKCE code verifier hashes.
    - OIDC state and nonce values.
    - Session identifiers (if using cookie-based sessions).[web:23]

- **Cloudflare Secrets / Environment Variables**
  - Worker secrets for:
    - Private signing keys (or encrypted key blobs if generated off‑platform).
    - Admin API key for client/user management.

### Optional Components

- **Durable Objects**
  - For stronger consistency around session state or key rotation, as demonstrated by existing Workers-based OIDC projects.[web:23][web:49]

## External Contracts and Integration Points

### Contract with OIDC Clients

The IdP must conform to the OIDC Discovery specification sufficiently for standard clients to work:[web:5][web:29]

- Discovery endpoint: `GET /.well-known/openid-configuration`.
- Required fields in discovery:
  - `issuer`
  - `authorization_endpoint`
  - `token_endpoint`
  - `jwks_uri`
  - `userinfo_endpoint`
  - `response_types_supported` (must at least support `code`).
  - `grant_types_supported` (must at least support `authorization_code`).
  - `id_token_signing_alg_values_supported` (e.g., `RS256`).
  - `scopes_supported` (`openid`, `email`, `profile`, `groups` optional).[web:5]
  - `code_challenge_methods_supported` (include `S256` for PKCE).[web:29]

### Contract with Cloudflare Zero Trust (Generic OIDC)

Cloudflare’s Generic OIDC integration expects the following from an arbitrary IdP:[web:5][web:8]

- An OIDC client (application) created in the IdP with:
  - `client_id`
  - `client_secret`
  - Allowed redirect URIs (Cloudflare callback URL).
- Discovery or explicit URLs for:
  - Issuer.
  - Authorization endpoint.
  - Token endpoint.
  - JWKS URI.
- ID token with standard OIDC claims (`sub`, `iss`, `aud`, `exp`, `iat`) and optional `email`, `name`, `groups`.

The guide must ensure the IdP can be configured in Cloudflare One using the documented process for the Generic OIDC connector.[web:5]

## Data Model and Storage Design

D1 will hold persistent entities; KV will hold short‑lived or cache entities.

### D1 Schema

#### Users Table

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,         -- UUIDv4
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- PBKDF2 or Argon2 hash
  created_at    INTEGER NOT NULL,        -- Unix timestamp (seconds)
  updated_at    INTEGER NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  profile_json  TEXT                      -- JSON (name, groups, custom claims)
);
```

#### Clients Table

```sql
CREATE TABLE clients (
  id              TEXT PRIMARY KEY,      -- client_id (UUID or random string)
  client_secret   TEXT NOT NULL,         -- hashed secret
  name            TEXT NOT NULL,
  redirect_uris   TEXT NOT NULL,        -- JSON array of URIs
  allowed_scopes  TEXT NOT NULL,        -- JSON array (e.g. ["openid","email"])
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  is_confidential INTEGER NOT NULL      -- 1 for confidential, 0 for public
);
```

#### Refresh Tokens Table (optional for v1)

```sql
CREATE TABLE refresh_tokens (
  id           TEXT PRIMARY KEY,        -- token id or opaque string
  client_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### KV Namespaces

Define at least one KV namespace, e.g., `OIDC_KV`, to store:

- Authorization codes: `auth_code:{code}` → JSON ({ user_id, client_id, redirect_uri, scope, code_challenge, code_challenge_method, nonce, created_at }).
- OIDC state: `state:{state}` → JSON ({ client_id, redirect_uri, created_at }).
- Nonces: `nonce:{nonce}` → JSON.
- Session identifiers (if using browser-based sessions): `session:{session_id}` → JSON ({ user_id, created_at, expires_at }).

Each of these keys should be stored with appropriate TTLs (e.g., 5–10 minutes for codes and state).

## Cryptography and Keys

### ID Token Signing

- Algorithm: RS256 (RSA with SHA-256) as recommended and supported widely by OIDC clients and Cloudflare.[web:5][web:29]
- Keys:
  - Private key: stored as a Worker secret or generated offline and imported into Workers via PEM.
  - Public keys: exposed via `GET /jwks.json` in JWKS (JSON Web Key Set) format.[web:29]

### Key Rotation

- Represent current signing key with a `kid` (key ID) and include it in the JWT header.
- JWKS endpoint must return all active public keys so clients can validate tokens even during rotation.
- For v1, manual rotation via a script and new deployment is acceptable; document rotation operations.

### Password Hashing

- Use PBKDF2, scrypt, or Argon2 algorithm implemented in a library compatible with Cloudflare Workers’ runtime (e.g., using `jose` or a light PBKDF2 helper or an external library designed for Workers).[web:18]
- Store only salted hashes; never store plaintext secrets.

### PKCE and OIDC Security Mechanisms

- Require PKCE (`S256`) by default for all public clients; allow optional enforcement for confidential clients.[web:5][web:29]
- Validate `state` parameter in the `/authorize` and callback flows to protect against CSRF.[web:29]
- Use `nonce` for ID token replay protection for browser-based flows.

## HTTP API and Endpoint Specifications

All endpoints are served by a single Worker script, routing by path and method.

### 1. Discovery Document

**Endpoint:** `GET /.well-known/openid-configuration`

**Behavior:**

- Return a JSON object conforming to OIDC Discovery containing at least the standard fields described earlier.[web:5]
- Values should be built from the configured `ISSUER` origin (e.g., `https://idp.example.com`).

**Status Codes:**

- `200 OK` with JSON body.

### 2. JWKS Endpoint

**Endpoint:** `GET /jwks.json`

**Behavior:**

- Return the current set of public keys in JWKS format:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-id-1",
      "use": "sig",
      "alg": "RS256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

**Status Codes:**

- `200 OK` with JSON body.

### 3. Authorization Endpoint

**Endpoint:** `GET /authorize`

**Supported Flow:** Authorization Code with PKCE.

**Query Parameters:**

- `response_type` (required): must be `code`.
- `client_id` (required): must exist in `clients` table.
- `redirect_uri` (required): must match one of the client’s allowed URIs exactly.
- `scope` (required): space-delimited list of requested scopes.
- `state` (required): random string from client for CSRF protection.
- `code_challenge` (required for PKCE): base64url-encoded SHA-256 hash of `code_verifier`.
- `code_challenge_method` (required for PKCE): must be `S256`.
- `nonce` (recommended for browser-based clients): random value to embed in ID token.[web:29]

**Behavior Outline:**

1. Validate client and `redirect_uri` from D1.
2. Parse and validate requested scopes against client’s allowed scopes.
3. Persist `state`, `nonce`, and PKCE challenge in KV with TTL.
4. If the user is not authenticated (no session cookie):
   - Render an HTML login page via Workers.
5. If the user is authenticated:
   - Generate an authorization code, store associated data in KV, and redirect back to `redirect_uri` with `code` and `state` query params.

**Status Codes:**

- Redirect `302` to login or client `redirect_uri` on success.
- `302` to `redirect_uri?error=...` for validation errors.

### 4. Login Endpoint

**Endpoint:**

- `GET /login`: Render HTML login form (email, password).
- `POST /login`: Process credentials.

**Behavior:**

- `GET /login`
  - Render a minimal form that posts to `/login` with hidden fields carrying original authorization request metadata or state key.

- `POST /login`
  - Look up user by email in D1.
  - Verify password hash.
  - If valid, create a session (server-side in KV or stateless JWT cookie) and redirect back to `/authorize` with preserved query parameters/state.

**Status Codes:**

- `200 OK` with HTML for GET.
- `302` redirect to `/authorize` or error page for POST.

### 5. Token Endpoint

**Endpoint:** `POST /token`

**Content-Type:** `application/x-www-form-urlencoded`

**Supported Grant Types:**

- `authorization_code`.

**Request Parameters:**

- `grant_type` = `authorization_code`.
- `code` (required): authorization code received from `/authorize`.
- `redirect_uri` (required): must match the value used in `/authorize`.
- `client_id` (required for public clients; implicit for confidential via basic auth).
- `client_secret` (for confidential clients using basic auth or body field).
- `code_verifier` (required for PKCE clients).[web:29]

**Behavior:**

1. Authenticate the client: validate `client_id` and `client_secret` for confidential clients.
2. Fetch authorization code data from KV; validate not expired and not used.
3. Validate that `redirect_uri` matches the one stored with the authorization code.
4. Validate PKCE by recomputing the SHA-256 of `code_verifier` and comparing to stored `code_challenge`.
5. Create ID token JWT with claims:
   - `iss`: issuer URL.
   - `sub`: user ID.
   - `aud`: client ID.
   - `exp`, `iat`.
   - `nonce` (if provided earlier).
   - Additional claims like `email`, `name`, `groups` from `profile_json`.
6. Create access token (opaque string or JWT) and optionally refresh token.
7. Mark authorization code as used (delete KV entry).

**Response:**

```json
{
  "access_token": "...",
  "id_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "..." // optional in v1
}
```

**Status Codes:**

- `200 OK` on success.
- `400 Bad Request` with `error` JSON for invalid code, PKCE, or redirect.
- `401 Unauthorized` for invalid client credentials.

### 6. Userinfo Endpoint

**Endpoint:** `GET /userinfo`

**Authorization:** `Authorization: Bearer <access_token>`.

**Behavior:**

- Validate the access token:
  - If opaque: look up in KV or D1.
  - If JWT: validate signature, issuer, audience, and expiry.
- Return a JSON document with claims appropriate to the granted scopes:

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Example User",
  "groups": ["admins", "staff"]
}
```

**Status Codes:**

- `200 OK` on success.
- `401 Unauthorized` if token invalid or missing.

### 7. Logout Endpoint (Optional v1)

**Endpoint:** `POST /logout` or `GET /logout`

**Behavior:**

- Invalidate server-side session in KV.
- Redirect to a post-logout URL or render confirmation.

## Admin and Management APIs

To support client and user management without modifying code, define simple admin APIs secured by an admin API key in Worker secrets.

### Authentication for Admin APIs

- Header: `X-Admin-Api-Key: <secret>`.
- Reject any admin request without this header or with an incorrect value.

### Admin: Create Client

**Endpoint:** `POST /admin/clients`

**Body (JSON):**

```json
{
  "name": "My App",
  "redirect_uris": ["https://app.example.com/oauth/callback"],
  "allowed_scopes": ["openid", "email", "profile"],
  "is_confidential": true
}
```

**Behavior:**

- Generate `client_id` and `client_secret`.
- Hash the `client_secret` before storing.
- Insert into D1.
- Return JSON with `client_id` and `client_secret`.

### Admin: Create User

**Endpoint:** `POST /admin/users`

**Body (JSON):**

```json
{
  "email": "user@example.com",
  "password": "plaintext-password",
  "profile": { "name": "User Name", "groups": ["admins"] }
}
```

**Behavior:**

- Validate input.
- Hash password.
- Insert record into D1.
- Return created user metadata (no password hash).

## Implementation Stack and Libraries

### Language and Tooling

- **TypeScript** as the main implementation language for the Worker.
- Use official Cloudflare Workers TypeScript templates and `wrangler` CLI.[web:18]

### Runtime Libraries

- **Routing**: a small router such as Hono or itty-router, or manual `switch` on `URL.pathname`.
- **JWT/JWS**: `jose` library, which supports the Web Crypto API and is compatible with Workers.
- **Validation**: lightweight schema validation (e.g., `zod`) for parsing and validating request data.

### Example Repositories and Patterns

- `eidam/cf-access-workers-oidc`: Demonstrates a mostly stateless OIDC provider on Workers and Durable Objects, integrated tightly with Cloudflare Access.[web:23]
- `Erisa/discord-oidc-worker`: Wraps Discord OAuth2 in an OIDC provider for Cloudflare Access using Workers.[web:46][web:47]
- `nberlette/cfauth`: OIDC endpoint on Workers using Durable Objects and Cloudflare Access for access control.[web:49]

These repositories provide patterns for route structure, KV usage, and Access integration that the implementation can adapt, but the new IdP should not depend on third-party OAuth providers like Discord or GitHub.

## Security Considerations

### Threat Model Highlights

- **CSRF**: Addressed via `state` parameter in OIDC flows and SameSite cookies for login sessions.[web:29]
- **Code Interception**: Addressed by PKCE (S256) and TLS everywhere.[web:29]
- **Replay Attacks**: Use `nonce` and ensure authorization codes are one-time use with short TTL.[web:29]
- **Token Leakage**: Keep access tokens small and short‑lived; avoid storing tokens in browser-local storage.
- **Key Compromise**: Rotate signing keys on a regular schedule and maintain key IDs and JWKS history.

### Concrete Controls

- Enforce HTTPS-only service (Workers with custom domain automatically serve TLS via Cloudflare).[web:50]
- Use secure, HttpOnly cookies for any session cookies.
- Limit TTL of KV items (codes, state, sessions) to the minimum needed.
- Implement basic rate limiting at the Worker level to mitigate brute-force login attempts.[web:25]

## Cloudflare Deployment and Configuration Steps

### Worker Deployment

1. Initialize project with `wrangler` using the TypeScript template.[web:18]
2. Configure `wrangler.toml`:
   - Bindings for D1 (`[[d1_databases]]`).
   - Bindings for KV namespaces (`[[kv_namespaces]]`).
   - Environment variables (issuer, admin key, etc.).
3. Run `wrangler dev` locally for testing.
4. Deploy with `wrangler deploy`.

### Custom Domain

1. Map a custom hostname (e.g., `idp.example.com`) to the Worker using Cloudflare’s routes.[web:50]
2. Confirm that `https://idp.example.com/.well-known/openid-configuration` is reachable and correct.

### Register IdP in Cloudflare Zero Trust (Generic OIDC)

Follow the Cloudflare One documentation for adding a Generic OIDC provider:[web:5][web:8]

1. In Zero Trust dashboard, go to **Integrations → Identity providers**.
2. Click **Add new identity provider**, select **OpenID Connect**.
3. Fill in:
   - **Name**: e.g., `Custom Workers IdP`.
   - **Issuer**: `https://idp.example.com`.
   - **Client ID** and **Client Secret**: values from `/admin/clients` for the Cloudflare client entry.
   - **Authorization endpoint**: `https://idp.example.com/authorize`.
   - **Token endpoint**: `https://idp.example.com/token`.
   - **JWKS URI**: `https://idp.example.com/jwks.json`.
4. (Optional) Enable PKCE if supported (yes in this design).
5. Save and test connection.

Cloudflare Access will then use this IdP for validating user identity and populating OIDC claims, which can be consumed by Access policies and SaaS/OIDC applications protected by Cloudflare.[web:5][web:8]

## Testing and Validation Plan

### Unit and Integration Tests

- Write unit tests for:
  - JWT generation and validation.
  - PKCE verification logic.
  - D1 CRUD operations for users and clients.
- Use integration tests (e.g., Playwright or a simple script) to:
  - Simulate browser flow: `/authorize` → login → redirect with `code` → `/token` → `/userinfo`.

### Conformance and Interop

- Use public tools like `oidcdebugger.com` to test the authorization code flow with discovery URL pointing to the Worker.[web:29]
- Configure a small sample app (e.g., a simple Node or Rust backend) as an OIDC client and verify:
  - Token signature and claims.
  - Behavior on token expiry.

### Cloudflare Access Integration Tests

- Register the IdP in Cloudflare Zero Trust.
- Create a test Access application:
  - Self-hosted HTTP or SaaS app behind Cloudflare.[web:8]
- Confirm that login via the custom IdP succeeds and that Access JWTs contain the expected user identity and custom claims.[web:5][web:8]

## Implementation Phases and Milestones

1. **Skeleton Worker and Routing**
   - Create TypeScript Worker with routing for all endpoints.
   - Implement discovery and static JWKS endpoint (with stub keys).

2. **D1 Integration and Data Model**
   - Define schemas for `users`, `clients`, and `refresh_tokens`.
   - Implement basic CRUD operations via admin endpoints.

3. **Auth Flow: /authorize, /login, /token**
   - Implement `/authorize` with PKCE and state handling via KV.
   - Implement login UI and session creation.
   - Implement `/token` with code verification and JWT issuance.

4. **Userinfo and Sessions**
   - Implement `/userinfo` and validate access tokens.
   - Add logout and session invalidation (if using server sessions).

5. **Security Hardening**
   - Enforce TLS, HttpOnly cookies, proper TTLs.
   - Add rate limiting and better input validation.[web:25]

6. **Cloudflare One Integration**
   - Register as Generic OIDC in Zero Trust and validate end-to-end login to a test app.[web:5][web:8]

7. **Documentation and Operational Runbook**
   - Document all environment variables, rotation procedures, and admin API usage.
   - Document key rotation process and any migration steps.

This guide provides all the contracts, components, and behaviors an implementation agent needs to build a robust, Cloudflare-native OIDC Identity Provider that can be registered and used by Cloudflare Zero Trust as a Generic OIDC IdP.[web:5][web:23][web:29][web:18][web:8][web:50][web:25]
