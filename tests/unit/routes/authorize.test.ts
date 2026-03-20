import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../../src/router';
import { D1Mock } from '../helpers/d1-mock';
import { KVMock } from '../helpers/kv-mock';
import type { Env } from '../../../src/types';
import { createClient } from '../../../src/db/clients';

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

const app = createApp();
let d1: D1Mock;
let kvMock: KVMock;
let testEnv: Env;
let clientId: string;
const REDIRECT_URI = 'https://app.example.com/callback';

const PKCE = {
  challenge: 'abc123challenge_base64url_encoded_sha256',
  method: 'S256',
  state: 'random-csrf-state',
};

beforeEach(async () => {
  d1 = new D1Mock();
  d1.createTable('users');
  d1.createTable('clients');
  kvMock = new KVMock();

  testEnv = {
    OIDC_DB: d1.asD1(),
    OIDC_KV: kvMock.asKV(),
    SIGNING_KEY_PRIVATE: TEST_PRIVATE_KEY_PEM,
    ADMIN_API_KEY: 'test-admin-secret',
    ISSUER: 'https://idp.example.com',
  };

  const { client } = await createClient(d1.asD1(), {
    name: 'Test App',
    redirectUris: [REDIRECT_URI],
    allowedScopes: ['openid', 'email', 'profile'],
    isConfidential: true,
  });
  clientId = client.id;
});

const authorize = (params: Record<string, string>): Promise<Response> => {
  const url = new URL('http://localhost/authorize');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return app.fetch(new Request(url.toString()), testEnv);
};

const validParams = (): Record<string, string> => ({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: 'openid email',
  state: PKCE.state,
  code_challenge: PKCE.challenge,
  code_challenge_method: PKCE.method,
});

// ── Missing / invalid client ──────────────────────────────────────────────────

describe('GET /authorize — client validation', () => {
  it('returns 400 when client_id is missing', async () => {
    const { client_id: _cid, ...params } = validParams();
    const res = await authorize(params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
  });

  it('returns 400 for unknown client_id', async () => {
    const res = await authorize({ ...validParams(), client_id: 'unknown-client' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_client');
  });

  it('returns 400 when redirect_uri is missing (no redirect)', async () => {
    const { redirect_uri: _omit, ...params } = validParams();
    const res = await authorize(params);
    expect(res.status).toBe(400);
  });

  it('returns 400 when redirect_uri does not match — does not redirect', async () => {
    const res = await authorize({
      ...validParams(),
      redirect_uri: 'https://evil.com/callback',
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });
});

// ── PKCE / parameter validation (redirect-based errors) ───────────────────────

describe('GET /authorize — PKCE and parameter validation', () => {
  it('redirects with error for wrong response_type', async () => {
    const res = await authorize({ ...validParams(), response_type: 'token' });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('unsupported_response_type');
  });

  it('redirects with error when scope is missing', async () => {
    const { scope: _omit, ...params } = validParams();
    const res = await authorize(params);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_scope');
  });

  it('redirects with error when openid scope is absent', async () => {
    const res = await authorize({ ...validParams(), scope: 'email' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_scope');
  });

  it('redirects with error when state is missing', async () => {
    const { state: _omit, ...params } = validParams();
    const res = await authorize(params);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_request');
  });

  it('redirects with error when code_challenge is missing', async () => {
    const { code_challenge: _omit, ...params } = validParams();
    const res = await authorize(params);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_request');
  });

  it('redirects with error for plain code_challenge_method', async () => {
    const res = await authorize({ ...validParams(), code_challenge_method: 'plain' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_request');
  });
});

// ── Happy paths ───────────────────────────────────────────────────────────────

describe('GET /authorize — successful flows', () => {
  it('redirects to /login when no session exists', async () => {
    const res = await authorize(validParams());
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('/login');
    expect(location).toContain(`state=${PKCE.state}`);
  });

  it('error redirects include state parameter', async () => {
    const res = await authorize({ ...validParams(), response_type: 'token' });
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('state')).toBe(PKCE.state);
  });
});
