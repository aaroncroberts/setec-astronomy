// Declares the Workers env bindings used in integration tests.
// The `env` export from `cloudflare:test` is typed as `Cloudflare.Env`.
declare namespace Cloudflare {
  interface Env {
    OIDC_DB: D1Database;
    OIDC_KV: KVNamespace;
    SIGNING_KEY_PRIVATE: string;
    ADMIN_API_KEY: string;
    ISSUER: string;
  }
}
