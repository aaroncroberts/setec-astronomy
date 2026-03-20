import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../../src/router';
import { D1Mock } from '../helpers/d1-mock';
import type { Env } from '../../../src/types';

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

let testEnv: Env;
const app = createApp();

beforeEach(() => {
  const mock = new D1Mock();
  mock.createTable('users');
  mock.createTable('clients');

  testEnv = {
    OIDC_DB: mock.asD1(),
    OIDC_KV: {} as KVNamespace,
    SIGNING_KEY_PRIVATE: TEST_PRIVATE_KEY_PEM,
    ADMIN_API_KEY: 'test-admin-secret',
    ISSUER: 'https://idp.example.com',
  };
});

const adminPost = (path: string, body: unknown, apiKey?: string): Promise<Response> =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey !== undefined ? { 'x-admin-api-key': apiKey } : {}),
      },
      body: JSON.stringify(body),
    }),
    testEnv,
  );

// ── Admin auth middleware ─────────────────────────────────────────────────────

describe('Admin auth middleware', () => {
  it('returns 401 when X-Admin-Api-Key header is missing', async () => {
    const res = await adminPost('/admin/users', { email: 'x@x.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong API key', async () => {
    const res = await adminPost(
      '/admin/users',
      { email: 'x@x.com', password: 'password123' },
      'wrong-key',
    );
    expect(res.status).toBe(401);
  });

  it('passes through with correct API key', async () => {
    const res = await adminPost(
      '/admin/users',
      { email: 'valid@example.com', password: 'password123' },
      'test-admin-secret',
    );
    expect(res.status).toBe(201);
  });
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe('POST /admin/users', () => {
  it('creates a user and returns 201 without password hash', async () => {
    const res = await adminPost(
      '/admin/users',
      { email: 'alice@example.com', password: 'secure-password-123' },
      'test-admin-secret',
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe('alice@example.com');
    expect(body.id).toBeTruthy();
    expect(body.password_hash).toBeUndefined();
  });

  it('returns 400 for invalid email', async () => {
    const res = await adminPost(
      '/admin/users',
      { email: 'not-an-email', password: 'password123' },
      'test-admin-secret',
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
  });

  it('returns 400 for short password', async () => {
    const res = await adminPost(
      '/admin/users',
      { email: 'ok@example.com', password: 'short' },
      'test-admin-secret',
    );
    expect(res.status).toBe(400);
  });

  it('stores groups in profile_json', async () => {
    const res = await adminPost(
      '/admin/users',
      {
        email: 'bob@example.com',
        password: 'password123',
        profile: { name: 'Bob', groups: ['admins'] },
      },
      'test-admin-secret',
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(JSON.parse(body.profile_json as string)).toMatchObject({ groups: ['admins'] });
  });
});

// ── POST /admin/clients ───────────────────────────────────────────────────────

describe('POST /admin/clients', () => {
  it('creates a client and returns 201 with client_id and client_secret', async () => {
    const res = await adminPost(
      '/admin/clients',
      {
        name: 'My App',
        redirect_uris: ['https://app.example.com/callback'],
        allowed_scopes: ['openid', 'email'],
        is_confidential: true,
      },
      'test-admin-secret',
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBeTruthy();
    expect(typeof body.client_secret).toBe('string');
    expect(body.client_secret.length).toBeGreaterThan(20);
    expect(body.name).toBe('My App');
  });

  it('returns 400 when openid scope is missing', async () => {
    const res = await adminPost(
      '/admin/clients',
      {
        name: 'Bad App',
        redirect_uris: ['https://app.example.com/callback'],
        allowed_scopes: ['email'],
        is_confidential: true,
      },
      'test-admin-secret',
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid redirect URI', async () => {
    const res = await adminPost(
      '/admin/clients',
      {
        name: 'App',
        redirect_uris: ['not-a-url'],
        allowed_scopes: ['openid'],
        is_confidential: true,
      },
      'test-admin-secret',
    );
    expect(res.status).toBe(400);
  });
});
