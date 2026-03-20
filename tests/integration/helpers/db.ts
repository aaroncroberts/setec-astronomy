/**
 * Integration test helpers for D1 database setup.
 *
 * These helpers apply migrations to the test D1 binding so each test
 * file starts with a clean, fully-migrated schema.
 */

const MIGRATIONS = [
  // 0001_create_users
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    profile_json  TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);`,

  // 0002_create_clients
  `CREATE TABLE IF NOT EXISTS clients (
    id              TEXT PRIMARY KEY,
    client_secret   TEXT NOT NULL,
    name            TEXT NOT NULL,
    redirect_uris   TEXT NOT NULL,
    allowed_scopes  TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    is_confidential INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);`,

  // 0003_create_refresh_tokens
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id ON refresh_tokens(client_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires   ON refresh_tokens(expires_at);`,
];

/** Apply all migrations to a D1 binding. Safe to call multiple times (IF NOT EXISTS). */
export async function applyMigrations(db: D1Database): Promise<void> {
  for (const sql of MIGRATIONS) {
    // D1 batch() runs statements in a transaction
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => db.prepare(s));
    await db.batch(statements);
  }
}

/** Drop all tables to give each test a clean slate. */
export async function resetDatabase(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM refresh_tokens'),
    db.prepare('DELETE FROM clients'),
    db.prepare('DELETE FROM users'),
  ]);
}
