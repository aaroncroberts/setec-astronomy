/**
 * Worker environment bindings.
 * All types derived from wrangler.toml bindings + Worker secrets.
 */
export interface Env {
  // D1 — persistent storage (users, clients, refresh tokens)
  OIDC_DB: D1Database;

  // KV — short-lived state (auth codes, PKCE, sessions, nonces)
  OIDC_KV: KVNamespace;

  // Secrets (set via `wrangler secret put`)
  SIGNING_KEY_PRIVATE: string; // RSA private key PEM (RS256 signing)
  ADMIN_API_KEY: string; // Admin API authentication key

  // Environment variables
  ISSUER: string; // Public base URL, e.g. https://idp.example.com
}
