# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-03-20

### Added

- **Authorization Code Flow with PKCE** — full OIDC 1.0 authorization code grant
  with mandatory PKCE S256 challenge/verifier pairs (RFC 7636)
- **RS256 JWT issuance** — ID tokens and access tokens signed with RS256 via
  Web Crypto API (`jose` library); JWKS endpoint exposes the public key
- **OpenID Connect Discovery** — `/.well-known/openid-configuration` document
  conforming to the OIDC Discovery 1.0 spec
- **Login flow** — `GET /login` form + `POST /login` handler with PBKDF2
  password verification (310,000 iterations, SHA-256); sets `HttpOnly; Secure;
SameSite=Lax` session cookie
- **Token endpoint** — `POST /token` with confidential client authentication
  (HTTP Basic or body `client_secret`), one-time authorization code consumption,
  and PKCE verification
- **UserInfo endpoint** — `GET /userinfo` (and `POST`) returning standard OIDC
  claims filtered by granted scopes (`email`, `profile`)
- **Logout** — `GET /logout` clears the KV session and optional
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
- **Documentation** — README, deployment guide, Admin API reference, key
  rotation runbook

[Unreleased]: https://github.com/aaroncroberts/setec-astronomy/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aaroncroberts/setec-astronomy/releases/tag/v0.1.0
