import { describe, it, expect, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { createApp } from '../../../src/router';
import { D1Mock } from '../helpers/d1-mock';
import { KVMock } from '../helpers/kv-mock';
import type { Env } from '../../../src/types';
import { createUser } from '../../../src/db/users';
import { createClient } from '../../../src/db/clients';
import { putAuthCode } from '../../../src/kv/store';
import type { AuthCodeData } from '../../../src/kv/store';

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
const REDIRECT_URI = 'https://app.example.com/callback';
const CODE = 'test-auth-code-001';

// A real PKCE verifier/challenge pair (pre-computed)
// verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
// challenge = BASE64URL(SHA256(verifier))
const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
// We'll compute the challenge dynamically in beforeAll

let testEnv: Env;
let d1: D1Mock;
let kvMock: KVMock;
let clientId: string;
let clientSecret: string;
let userId: string;
let pkceChallenge: string;

async function computeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const bytes = new Uint8Array(digest);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

beforeEach(async () => {
  d1 = new D1Mock();
  d1.createTable('users');
  d1.createTable('clients');
  kvMock = new KVMock();
  const kv = kvMock.asKV();

  testEnv = {
    OIDC_DB: d1.asD1(),
    OIDC_KV: kv,
    SIGNING_KEY_PRIVATE: TEST_PRIVATE_KEY_PEM,
    ADMIN_API_KEY: 'test-admin-secret',
    ISSUER: 'https://idp.example.com',
  };

  // Create user
  const { hashPassword } = await import('../../../src/crypto/password');
  const user = await createUser(d1.asD1(), {
    email: 'alice@example.com',
    password_hash: await hashPassword('secure-password'),
  });
  userId = user.id;

  // Create client
  const result = await createClient(d1.asD1(), {
    name: 'Test App',
    redirectUris: [REDIRECT_URI],
    allowedScopes: ['openid', 'email', 'profile'],
    isConfidential: true,
  });
  clientId = result.client.id;
  clientSecret = result.clientSecret;

  // Compute real PKCE challenge
  pkceChallenge = await computeChallenge(PKCE_VERIFIER);

  // Seed auth code in KV
  const codeData: AuthCodeData = {
    clientId,
    redirectUri: REDIRECT_URI,
    scope: 'openid email',
    userId,
    codeChallenge: pkceChallenge,
    codeChallengeMethod: 'S256',
  };
  await putAuthCode(kv, CODE, codeData);
});

const postToken = (fields: Record<string, string>, secret?: string): Promise<Response> => {
  const body = new URLSearchParams(fields).toString();
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (secret) headers['authorization'] = `Basic ${btoa(`${fields['client_id']}:${secret}`)}`;
  return app.fetch(
    new Request('http://localhost/token', { method: 'POST', headers, body }),
    testEnv,
  );
};

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /token — success', () => {
  it('returns access_token, id_token, token_type, expires_in', async () => {
    const res = await postToken({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: PKCE_VERIFIER,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.access_token).toBe('string');
    expect(typeof body.id_token).toBe('string');
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(3600);
  });

  it('id_token contains required OIDC claims', async () => {
    const res = await postToken({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: PKCE_VERIFIER,
    });
    const { id_token } = await res.json();
    const payload = decodeJwt(id_token as string);
    expect(payload.iss).toBe('https://idp.example.com');
    expect(payload.sub).toBe(userId);
    expect(payload.aud).toBe(clientId);
    expect(payload.email).toBe('alice@example.com');
  });
});

// ── PKCE failures ─────────────────────────────────────────────────────────────

describe('POST /token — PKCE failures', () => {
  it('returns 400 invalid_grant for wrong code_verifier', async () => {
    const res = await postToken({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: 'wrong-verifier-that-does-not-match-the-challenge-xxxx',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_grant');
  });

  it('returns 400 invalid_grant when code is reused', async () => {
    // First exchange — should succeed
    await postToken({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: PKCE_VERIFIER,
    });

    // Second exchange with same code — must fail
    const res = await postToken({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: PKCE_VERIFIER,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_grant');
  });
});

// ── Client auth failures ──────────────────────────────────────────────────────

describe('POST /token — client auth failures', () => {
  it('returns 401 invalid_client for wrong secret', async () => {
    const res = await postToken({
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: 'wrong-secret',
      code_verifier: PKCE_VERIFIER,
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_client');
  });

  it('returns 400 for unsupported grant_type', async () => {
    const res = await postToken({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unsupported_grant_type');
  });
});
