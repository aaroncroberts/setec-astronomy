import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../../../src/router';
import { D1Mock } from '../helpers/d1-mock';
import { KVMock } from '../helpers/kv-mock';
import type { Env } from '../../../src/types';
import { createUser } from '../../../src/db/users';
import { importRsaPrivateKey } from '../../../src/crypto/keys';
import { signAccessToken } from '../../../src/tokens/issue';

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

const KID = 'key-1';
const ISSUER = 'https://idp.example.com';

const app = createApp();
let d1: D1Mock;
let testEnv: Env;
let userId: string;
let privateKey: CryptoKey;

beforeAll(async () => {
  privateKey = await importRsaPrivateKey(TEST_PRIVATE_KEY_PEM);
});

beforeEach(async () => {
  d1 = new D1Mock();
  d1.createTable('users');
  d1.createTable('clients');

  testEnv = {
    OIDC_DB: d1.asD1(),
    OIDC_KV: new KVMock().asKV(),
    SIGNING_KEY_PRIVATE: TEST_PRIVATE_KEY_PEM,
    ADMIN_API_KEY: 'test-admin-secret',
    ISSUER,
  };

  const { hashPassword } = await import('../../../src/crypto/password');
  const user = await createUser(d1.asD1(), {
    email: 'alice@example.com',
    password_hash: await hashPassword('pw'),
    profile: { name: 'Alice', groups: ['admins'] },
  });
  userId = user.id;
});

const makeToken = (scope: string): Promise<string> =>
  signAccessToken({ iss: ISSUER, sub: userId, scope, client_id: 'c1' }, privateKey, KID);

const getInfo = (token?: string): Promise<Response> =>
  app.fetch(
    new Request('http://localhost/userinfo', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    testEnv,
  );

describe('GET /userinfo', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await getInfo();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('returns 401 for an invalid token', async () => {
    const res = await getInfo('not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('returns sub claim for openid scope', async () => {
    const token = await makeToken('openid');
    const res = await getInfo(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sub).toBe(userId);
  });

  it('includes email when email scope granted', async () => {
    const token = await makeToken('openid email');
    const res = await getInfo(token);
    const body = await res.json();
    expect(body.email).toBe('alice@example.com');
    expect(body.email_verified).toBe(false);
  });

  it('does not include email when email scope not granted', async () => {
    const token = await makeToken('openid');
    const res = await getInfo(token);
    const body = await res.json();
    expect(body.email).toBeUndefined();
  });

  it('includes name and groups when profile scope granted', async () => {
    const token = await makeToken('openid email profile');
    const res = await getInfo(token);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.groups).toEqual(['admins']);
  });
});
