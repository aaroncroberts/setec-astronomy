/**
 * Integration smoke tests — verify the Worker starts cleanly and core
 * endpoints respond correctly against a real Miniflare Workers runtime
 * with real D1 and KV bindings.
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from './helpers/db';

beforeAll(async () => {
  await applyMigrations(env.OIDC_DB);
});

describe('GET /health', () => {
  it('returns 200 OK', async () => {
    const res = await SELF.fetch('http://localhost/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /.well-known/openid-configuration', () => {
  it('returns a valid OIDC discovery document', async () => {
    const res = await SELF.fetch('http://localhost/.well-known/openid-configuration');
    expect(res.status).toBe(200);

    const doc = await res.json();
    expect(typeof doc.issuer).toBe('string');
    expect(typeof doc.authorization_endpoint).toBe('string');
    expect(typeof doc.token_endpoint).toBe('string');
    expect(typeof doc.jwks_uri).toBe('string');
    expect(Array.isArray(doc.response_types_supported)).toBe(true);
    expect(Array.isArray(doc.id_token_signing_alg_values_supported)).toBe(true);
    expect((doc.id_token_signing_alg_values_supported as string[]).includes('RS256')).toBe(true);
  });
});

describe('GET /jwks.json', () => {
  it('returns a JWKS with at least one key', async () => {
    const res = await SELF.fetch('http://localhost/jwks.json');
    expect(res.status).toBe(200);

    const jwks = await res.json();
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
  });
});

describe('GET /authorize — missing params', () => {
  it('returns 400 for missing client_id', async () => {
    const res = await SELF.fetch('http://localhost/authorize');
    expect(res.status).toBe(400);
  });
});
