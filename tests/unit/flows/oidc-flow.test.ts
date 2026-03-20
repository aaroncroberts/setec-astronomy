/**
 * Full OIDC Authorization Code + PKCE flow integration test.
 *
 * This test drives the complete flow programmatically:
 * 1. Create user and client (admin API)
 * 2. GET /authorize — validates and stores state in KV
 * 3. POST /login — verifies credentials, creates session
 * 4. GET /authorize (with session) — generates auth code
 * 5. POST /token — exchanges code for tokens (PKCE verification)
 * 6. GET /userinfo — validates access token, returns claims
 *
 * This is a state-machine integration test that validates the entire
 * request/response chain using in-memory D1 and KV mocks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { createApp } from '../../../src/router';
import { D1Mock } from '../helpers/d1-mock';
import { KVMock } from '../helpers/kv-mock';
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

const ISSUER = 'https://idp.example.com';
const REDIRECT_URI = 'https://app.example.com/callback';
const USER_EMAIL = 'alice@example.com';
const USER_PASSWORD = 'secure-password-123';

// Real PKCE pair
const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

async function computeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const binary = Array.from(new Uint8Array(digest), (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const app = createApp();
let testEnv: Env;
let d1: D1Mock;
let kvMock: KVMock;

beforeEach(() => {
  d1 = new D1Mock();
  d1.createTable('users');
  d1.createTable('clients');
  kvMock = new KVMock();

  testEnv = {
    OIDC_DB: d1.asD1(),
    OIDC_KV: kvMock.asKV(),
    SIGNING_KEY_PRIVATE: TEST_PRIVATE_KEY_PEM,
    ADMIN_API_KEY: 'test-admin-api-key',
    ISSUER,
  };
});

describe('Full OIDC Authorization Code + PKCE flow', () => {
  it('completes the entire authorize → login → token → userinfo flow', async () => {
    // ── Step 1: Create user via admin API ─────────────────────────────────────

    const userRes = await app.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-api-key': 'test-admin-api-key',
        },
        body: JSON.stringify({
          email: USER_EMAIL,
          password: USER_PASSWORD,
          profile: { name: 'Alice', groups: ['users'] },
        }),
      }),
      testEnv,
    );
    expect(userRes.status).toBe(201);
    const { id: userId } = await userRes.json();

    // ── Step 2: Create client via admin API ───────────────────────────────────

    const clientRes = await app.fetch(
      new Request('http://localhost/admin/clients', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-api-key': 'test-admin-api-key',
        },
        body: JSON.stringify({
          name: 'Test SPA',
          redirect_uris: [REDIRECT_URI],
          allowed_scopes: ['openid', 'email', 'profile'],
          is_confidential: true,
        }),
      }),
      testEnv,
    );
    expect(clientRes.status).toBe(201);
    const { client_id: clientId, client_secret: clientSecret } = await clientRes.json();

    // ── Step 3: GET /authorize — valid request, no session ────────────────────

    const pkceChallenge = await computeChallenge(PKCE_VERIFIER);
    const state = 'csrf-state-' + Math.random().toString(36).slice(2);
    const nonce = 'nonce-' + Math.random().toString(36).slice(2);

    const authorizeUrl = new URL('http://localhost/authorize');
    authorizeUrl.searchParams.set('client_id', clientId as string);
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid email profile');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', pkceChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('nonce', nonce);

    const authorizeRes = await app.fetch(new Request(authorizeUrl.toString()), testEnv);
    expect(authorizeRes.status).toBe(302);
    const loginRedirect = authorizeRes.headers.get('location')!;
    expect(loginRedirect).toContain('/login');
    expect(loginRedirect).toContain(`state=${state}`);

    // ── Step 4: POST /login — valid credentials ───────────────────────────────

    const loginRes = await app.fetch(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: USER_EMAIL,
          password: USER_PASSWORD,
          state,
        }).toString(),
      }),
      testEnv,
    );
    expect(loginRes.status).toBe(302);
    const sessionCookie = loginRes.headers.get('set-cookie')!;
    expect(sessionCookie).toContain('sid=');
    expect(sessionCookie).toContain('HttpOnly');

    // Extract session ID from cookie for use in next request
    const sidMatch = sessionCookie.match(/sid=([^;]+)/);
    const sessionId = sidMatch?.[1];
    expect(sessionId).toBeTruthy();

    // ── Step 5: GET /authorize with session — should issue auth code ──────────

    const authorizeWithSessionRes = await app.fetch(
      new Request(authorizeUrl.toString(), {
        headers: { cookie: `sid=${sessionId}` },
      }),
      testEnv,
    );
    expect(authorizeWithSessionRes.status).toBe(302);
    const codeRedirect = authorizeWithSessionRes.headers.get('location')!;
    expect(codeRedirect).toContain(REDIRECT_URI);

    const codeUrl = new URL(codeRedirect);
    const code = codeUrl.searchParams.get('code')!;
    expect(code).toBeTruthy();
    expect(codeUrl.searchParams.get('state')).toBe(state);

    // ── Step 6: POST /token — exchange code for tokens ────────────────────────

    const tokenRes = await app.fetch(
      new Request('http://localhost/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId as string,
          client_secret: clientSecret as string,
          code_verifier: PKCE_VERIFIER,
        }).toString(),
      }),
      testEnv,
    );
    expect(tokenRes.status).toBe(200);
    const tokens = await tokenRes.json();
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.id_token).toBeTruthy();
    expect(tokens.token_type).toBe('Bearer');

    // Verify ID token claims
    const idTokenPayload = decodeJwt(tokens.id_token as string);
    expect(idTokenPayload.iss).toBe(ISSUER);
    expect(idTokenPayload.sub).toBe(userId as string);
    expect(idTokenPayload.aud).toBe(clientId as string);
    expect(idTokenPayload.email).toBe(USER_EMAIL);
    expect(idTokenPayload.nonce).toBe(nonce);
    expect(idTokenPayload.name).toBe('Alice');

    // ── Step 7: GET /userinfo with access token ───────────────────────────────

    const userinfoRes = await app.fetch(
      new Request('http://localhost/userinfo', {
        headers: { authorization: `Bearer ${tokens.access_token as string}` },
      }),
      testEnv,
    );
    expect(userinfoRes.status).toBe(200);
    const userinfo = await userinfoRes.json();
    expect(userinfo.sub).toBe(userId as string);
    expect(userinfo.email).toBe(USER_EMAIL);
    expect(userinfo.name).toBe('Alice');
    expect(userinfo.groups).toEqual(['users']);

    // ── Step 8: Verify auth code cannot be reused ─────────────────────────────

    const reuseRes = await app.fetch(
      new Request('http://localhost/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId as string,
          client_secret: clientSecret as string,
          code_verifier: PKCE_VERIFIER,
        }).toString(),
      }),
      testEnv,
    );
    expect(reuseRes.status).toBe(400);
    const reuseBody = await reuseRes.json();
    expect(reuseBody.error).toBe('invalid_grant');
  });
});
