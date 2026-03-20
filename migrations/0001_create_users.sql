-- Migration 0001: Create users table
--
-- Stores first-party user accounts for the OIDC IdP.
-- Passwords are stored as PBKDF2 hashes (never plaintext).
-- profile_json stores additional claims: name, groups, custom attributes.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,               -- UUIDv4
  email         TEXT NOT NULL UNIQUE,           -- Login identifier
  password_hash TEXT NOT NULL,                  -- PBKDF2: "salt:hash" base64
  created_at    INTEGER NOT NULL,               -- Unix timestamp (seconds)
  updated_at    INTEGER NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,     -- 1=active, 0=deactivated
  profile_json  TEXT NOT NULL DEFAULT '{}'      -- JSON: {name, groups, ...}
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
