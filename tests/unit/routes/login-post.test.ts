import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../../src/router';
import { D1Mock } from '../helpers/d1-mock';
import { KVMock } from '../helpers/kv-mock';
import type { Env } from '../../../src/types';
import { createUser } from '../../../src/db/users';
import { putState } from '../../../src/kv/store';
import type { StateData } from '../../../src/kv/store';

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

const TEST_STATE = 'test-csrf-state-123';
const TEST_EMAIL = 'alice@example.com';
const TEST_PASSWORD = 'correct-password-123';

const stateData: StateData = {
  clientId: 'client-abc',
  redirectUri: 'https://app.example.com/callback',
  scope: 'openid email',
  codeChallenge: 'abc123_challenge',
  codeChallengeMethod: 'S256',
};

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

  // Pre-create the test user
  const { hashPassword } = await import('../../../src/crypto/password');
  await createUser(d1.asD1(), {
    email: TEST_EMAIL,
    password_hash: await hashPassword(TEST_PASSWORD),
  });

  // Pre-seed state in KV
  await putState(kv, TEST_STATE, stateData);
});

const postLogin = (fields: Record<string, string>): Promise<Response> => {
  const body = new URLSearchParams(fields).toString();
  return app.fetch(
    new Request('http://localhost/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
    testEnv,
  );
};

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /login — success', () => {
  it('redirects to /authorize on valid credentials', async () => {
    const res = await postLogin({ email: TEST_EMAIL, password: TEST_PASSWORD, state: TEST_STATE });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('/authorize');
    expect(location).toContain(`state=${TEST_STATE}`);
    expect(location).toContain(`client_id=${stateData.clientId}`);
  });

  it('sets an HttpOnly session cookie', async () => {
    const res = await postLogin({ email: TEST_EMAIL, password: TEST_PASSWORD, state: TEST_STATE });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('redirect includes original PKCE challenge', async () => {
    const res = await postLogin({ email: TEST_EMAIL, password: TEST_PASSWORD, state: TEST_STATE });
    const location = res.headers.get('location')!;
    expect(location).toContain(`code_challenge=${stateData.codeChallenge}`);
    expect(location).toContain('code_challenge_method=S256');
  });
});

// ── Failure paths ─────────────────────────────────────────────────────────────

describe('POST /login — failures', () => {
  it('redirects to /login with error for wrong password', async () => {
    const res = await postLogin({ email: TEST_EMAIL, password: 'wrong-password', state: TEST_STATE });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('/login');
    expect(location).toContain('error=');
    expect(location).not.toContain('sid=');
  });

  it('redirects to /login with error for unknown email', async () => {
    const res = await postLogin({
      email: 'nobody@example.com',
      password: TEST_PASSWORD,
      state: TEST_STATE,
    });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('/login');
    expect(location).toContain('error=');
  });

  it('redirects to /login with error for missing state', async () => {
    const res = await postLogin({ email: TEST_EMAIL, password: TEST_PASSWORD, state: 'no-such-state' });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('/login');
  });

  it('does not set session cookie on failure', async () => {
    const res = await postLogin({ email: TEST_EMAIL, password: 'wrong', state: TEST_STATE });
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toBeNull();
  });
});
