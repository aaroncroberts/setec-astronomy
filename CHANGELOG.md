# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-03-20

### Added

**Admin API — User Management**

- `GET /admin/users` — list all users with optional `search` (email/name substring),
  `limit` (default 20, max 100), and `offset` pagination; returns `{ users, total, limit, offset }`
- `GET /admin/users/:id` — fetch a single user by UUID; returns 404 if not found
- `PATCH /admin/users/:id` — partial update: `email`, `password` (re-hashed with PBKDF2),
  `is_active` (deactivate/reactivate), `profile` (`name`, `groups`); rejects empty bodies
- `DELETE /admin/users/:id` — hard-deletes a user; returns 204 on success, 404 if not found
- `UpdateUserSchema` and `ListUsersQuerySchema` Zod schemas with coercion for query params
- Extended `D1Mock` test helper to support `UPDATE`, `DELETE`, `SELECT COUNT(*)`,
  and `SELECT` with `LIKE` filtering and `LIMIT`/`OFFSET` pagination

**Documentation**

- `docs/user-management.md` — user data model, `is_active` semantics, deactivation vs.
  hard-delete tradeoffs, full Admin API reference with curl examples, operator workflows
  (provision, offboard, reset password, group management), security considerations
- `docs/admin-api.md` — updated with stubs for all four new user endpoints
- `README.md` — linked `docs/user-management.md` in documentation table

**Demo App**

- `examples/demo-app/scripts/provision-user.sh` — shell script to provision a demo user
  via the Admin API before running the OIDC login demo; handles 409 conflicts gracefully
- `examples/demo-app/README.md` — full operator walkthrough: provision → protect → login → verify

### Changed

- `172` unit tests (up from 142); all passing

## [0.1.0] — 2026-03-20

### Added

**Core IdP**

- **Authorization Code Flow with PKCE** — full OIDC 1.0 authorization code grant
  with mandatory PKCE S256 challenge/verifier pairs (RFC 7636)
- **RS256 JWT issuance** — ID tokens and access tokens signed with RS256 via
  Web Crypto API (`jose` library); JWKS endpoint exposes the public key
- **OpenID Connect Discovery** — `/.well-known/openid-configuration` document
  conforming to the OIDC Discovery 1.0 spec
- **Login flow** — `GET /login` form + `POST /login` handler with PBKDF2
  password verification (310,000 iterations, SHA-256); sets
  `HttpOnly; Secure; SameSite=Lax` session cookie
- **Token endpoint** — `POST /token` with confidential client authentication
  (HTTP Basic or body `client_secret`), one-time authorization code consumption,
  and PKCE verification
- **UserInfo endpoint** — `GET /userinfo` (and `POST`) returning standard OIDC
  claims filtered by granted scopes (`email`, `profile`)
- **Logout** — `GET /logout` clears the KV session with optional
  `post_logout_redirect_uri` redirect
- **Admin API** — bearer-authenticated `POST /admin/users` and
  `POST /admin/clients` for provisioning identities and OAuth clients
- **Rate limiting** — KV-backed per-IP rate limiting on `POST /login`
  (5 attempts / 60 s window)
- **CORS middleware** — wildcard CORS headers on `/token` and `/userinfo`;
  preflight `OPTIONS` returns 204
- **Cloudflare Workers runtime** — Hono router, D1 (SQLite) for persistent
  storage, Workers KV for ephemeral state (auth codes, sessions, PKCE state)
- **Centralized Zod schemas** — all request validation in `src/schemas/`
- **142 unit tests** across 19 test files with in-memory D1/KV mocks; full
  end-to-end OIDC flow integration test
- **GitHub Actions CI** — typecheck, ESLint, Prettier, Vitest with coverage

**Local development environment**

- `npm run db:migrate:local` — applies all D1 migrations to local SQLite
- `npm run dev` — starts the Worker on `http://localhost:8787` with real local
  D1 and KV bindings; reads secrets from `.dev.vars`
- `npm run seed` — idempotent seed script that creates a test user and OIDC
  client via the Admin API and prints a ready-to-use `/authorize` URL with PKCE
- `.dev.vars.example` — documents all required secrets with generation commands
- `npm run test:integration` — smoke tests running inside a real Miniflare
  Workers runtime (`@cloudflare/vitest-pool-workers`)

**Documentation**

- `README.md` — project overview, architecture diagram, quick start, usage
- `docs/developer-guide.md` — local development onboarding (target: under 10 min)
- `docs/deployment.md` — step-by-step Cloudflare deployment runbook
- `docs/admin-api.md` — Admin API reference with curl examples
- `docs/key-rotation.md` — zero-downtime RSA key rotation runbook

[Unreleased]: https://github.com/aaroncroberts/setec-astronomy/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/aaroncroberts/setec-astronomy/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/aaroncroberts/setec-astronomy/releases/tag/v0.1.0
