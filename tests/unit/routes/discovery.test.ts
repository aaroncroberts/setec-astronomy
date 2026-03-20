import { describe, it, expect } from 'vitest';
import { createApp } from '../../../src/router';
import type { Env } from '../../../src/types';

// Real 2048-bit RSA test key (PKCS#8). Test use only — DO NOT use in production.
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC2kaXbtxTYcJt4
zVXFGPI9LYvKRWd9sUEWcJuX3jECdNMeoL7Uq9bAJpWO/jIKAXNZX6NvPT5DnpbS
9LY5l6nfMCA1woVszx1hwxtJKtsKsNl1Oi29Clj7z393umGqmQixTnjKgh7WVFgJ
ZMwJq+hl1RlovNM1DdwpsMcpVvWWV5BvLwX9acdDDHvG7FZGQ1yE+e9u47GAraej
xbUkycnbVK6lESAyM5yccmRKjQpksfQLJO7Z7vMfcFbYGifjvJbIbqYpDtrMNs0h
cPQf2HkklVnjupTyyb1NIUY5aEwXW7uHTvTlEflXOUAjRabsNkQxll+XMl3cF1H1
IK5gGhllAgMBAAECggEAJn+4Ngj5gFreri6+s317N6NvIwxXso26Z/z/EptsQlRY
YNEm7NP/yS1ZxHmeG7YKmQIt+Ls1chTzQTERbDurOsFvSWbns/ZI/+Cg1GERJ8P7
V1kZZA/Wi+NJwfmvtsXmq10c47dkwVWv6usyi6eQrkitvwRylXGCx9fbZ8BKsZUS
VbSpxfThCnMK/am5TGW/NrDrtz5TCCxy1s1E5j3rS5lK8dKtDtQJuRb1J5S8M0x5
dAB0HZc5mz+sgNx3hwX3ZL64si/rWdCOSZk0JKSLAN4OAVlkbf67fTIUEnr6cfoj
5EuZ7lOLzuGWqMRxpaAXvGiBhEpVWvFXQaq15kjk0QKBgQDZ9C9zfyM5lFO5RMRH
oPnDzId0hkD8GQNd/CbhAjYZstfetWCnx9wI4oJ2I/94PX9uzhE+jlCtmOzVSa6C
G90ytqqI5CBEr2Bh9LcgdSnmZ/q2NksBIk65jFvHZIixu42NondnfQk0bjU9/dbZ
aK24Q3AkpnZoFBP5gT5JloGfGwKBgQDWcDLuGdO5VlL//p+qpsl+HLIoXQB4rKhh
KCyUMx9Bbmw96RCXzdUCs1SCqkKEJf/TQJkh64dRHNRsR/AMj4hIrYy9AJrBgCCW
HDZGaA6ufxXOlv7+TQz0kJSRpDXVPzGUsYDRwsYeJn0zOlgor+JmNNT8Y5XFOaAq
PEa6IIgxfwKBgF0/irmoUGLHIhbm4+8dYR6zN9TTx6PT88vXIK8t6gWOrar8ANFn
wa0Pc++lsRw5e3bltR0FeGD9R35tWrsRvs5+tnGA4IliWyMtttetKPMJ04r3qZlf
mzzpXy7sxUr9Si+prdpZ9YE4EZFnM++qSIDIYYdcrNYUmQMrl4GWYfi3AoGAJwCh
Qs1PxRX+YrFdORy86UMu5EiGHWzJ82HrOclSlgQPi/MoIXQ+mg8j/+AX2RFQRowp
ThIYupgTyt4Kuz4f+5gVUQsbGrbDNopLFOM4SGS1Aq5UEszQ3mqtmw/S+sZTrkfa
tkxG3JUDkJ28Cypyc0SIuJ8kTor8prHv60qfeuECgYBC2ZXscesmE3H5V7EhpBDw
v3EXt/XkijtdX6eKYXlcza1sz6pFaxIwFd3YNO16oJLdMnMrrRUW7VKpnsesXum0
bvmNr4ehHpkBy3psoMk/hNG/+3i5Yss226yTvf+VbC3zyaewKPw5PiAtrts8YI0x
3j4XvPXOSyE14JjBHQx5Iw==
-----END PRIVATE KEY-----`;

const testEnv: Env = {
  OIDC_DB: {} as D1Database,
  OIDC_KV: {} as KVNamespace,
  SIGNING_KEY_PRIVATE: TEST_PRIVATE_KEY_PEM,
  ADMIN_API_KEY: 'test-admin-key',
  ISSUER: 'https://idp.example.com',
};

const app = createApp();

// Required OIDC Discovery fields per spec
const REQUIRED_DISCOVERY_FIELDS = [
  'issuer',
  'authorization_endpoint',
  'token_endpoint',
  'jwks_uri',
  'userinfo_endpoint',
  'response_types_supported',
  'grant_types_supported',
  'id_token_signing_alg_values_supported',
  'scopes_supported',
  'code_challenge_methods_supported',
] as const;

describe('GET /.well-known/openid-configuration', () => {
  it('returns 200 with application/json', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('contains all required OIDC discovery fields', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    const doc = await res.json();

    for (const field of REQUIRED_DISCOVERY_FIELDS) {
      expect(doc, `Missing required field: ${field}`).toHaveProperty(field);
    }
  });

  it('issuer matches ISSUER env var', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    const doc = await res.json();
    expect(doc.issuer).toBe('https://idp.example.com');
  });

  it('endpoints are derived from issuer', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    const doc = await res.json();
    expect(doc.authorization_endpoint).toBe('https://idp.example.com/authorize');
    expect(doc.token_endpoint).toBe('https://idp.example.com/token');
    expect(doc.jwks_uri).toBe('https://idp.example.com/jwks.json');
    expect(doc.userinfo_endpoint).toBe('https://idp.example.com/userinfo');
  });

  it('supports authorization_code grant and code response type', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    const doc = await res.json();
    expect(doc.response_types_supported).toContain('code');
    expect(doc.grant_types_supported).toContain('authorization_code');
  });

  it('supports S256 PKCE', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    const doc = await res.json();
    expect(doc.code_challenge_methods_supported).toContain('S256');
  });

  it('id_token_signing_alg_values_supported includes RS256', async () => {
    const res = await app.fetch(
      new Request('http://localhost/.well-known/openid-configuration'),
      testEnv,
    );
    const doc = await res.json();
    expect(doc.id_token_signing_alg_values_supported).toContain('RS256');
  });
});

describe('GET /jwks.json', () => {
  it('returns 200 with application/json', async () => {
    const res = await app.fetch(new Request('http://localhost/jwks.json'), testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns { keys: [...] } with at least one key', async () => {
    const res = await app.fetch(new Request('http://localhost/jwks.json'), testEnv);
    const body = await res.json();
    expect(body).toHaveProperty('keys');
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);
  });

  it('key has required JWKS fields: kty, kid, use, alg, n, e', async () => {
    const res = await app.fetch(new Request('http://localhost/jwks.json'), testEnv);
    const body = await res.json();
    const key = body.keys[0]!;

    expect(key.kty).toBe('RSA');
    expect(key.use).toBe('sig');
    expect(key.alg).toBe('RS256');
    expect(typeof key.kid).toBe('string');
    expect(typeof key.n).toBe('string');
    expect(key.e).toBe('AQAB');
  });
});
