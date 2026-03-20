import { describe, it, expect } from 'vitest';
import app from '../index';
import type { Env } from '../types';

// Minimal env stub — health check uses no bindings
const minimalEnv: Env = {
  OIDC_DB: {} as D1Database,
  OIDC_KV: {} as KVNamespace,
  SIGNING_KEY_PRIVATE: '',
  ADMIN_API_KEY: '',
  ISSUER: 'https://idp.example.com',
};

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const req = new Request('http://localhost/health');
    const res = await app.fetch(req, minimalEnv);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"status":"ok"}');
  });
});
