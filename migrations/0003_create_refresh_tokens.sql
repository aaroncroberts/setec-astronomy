-- Migration 0003: Create refresh tokens table
--
-- Stores issued refresh tokens for the authorization_code flow.
-- Tokens are soft-deleted via the revoked flag; hard cleanup via TTL jobs.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,                -- Opaque token string (UUID)
  client_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,               -- Unix timestamp (seconds)
  expires_at  INTEGER NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,     -- 1=revoked

  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id ON refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires   ON refresh_tokens(expires_at);
