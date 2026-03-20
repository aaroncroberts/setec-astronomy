-- Migration 0002: Create OIDC clients table
--
-- Each row represents a registered OIDC application (Relying Party).
-- client_secret is stored as a PBKDF2 hash.
-- redirect_uris and allowed_scopes are stored as JSON arrays.

CREATE TABLE IF NOT EXISTS clients (
  id              TEXT PRIMARY KEY,             -- client_id (UUID)
  client_secret   TEXT NOT NULL,               -- PBKDF2 hash of the secret
  name            TEXT NOT NULL,               -- Human-readable app name
  redirect_uris   TEXT NOT NULL,               -- JSON array of allowed URIs
  allowed_scopes  TEXT NOT NULL,               -- JSON array: ["openid","email",...]
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  is_confidential INTEGER NOT NULL DEFAULT 1   -- 1=confidential, 0=public (PKCE only)
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
