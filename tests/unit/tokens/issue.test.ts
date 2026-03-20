import { describe, it, expect, beforeAll } from 'vitest';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import {
  signIdToken,
  signAccessToken,
  validateAccessToken,
  ID_TOKEN_TTL,
  ACCESS_TOKEN_TTL,
} from '../../../src/tokens/issue';
import { importRsaPrivateKey, deriveAndExportPublicKey } from '../../../src/crypto/keys';

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

const KID = 'test-key-1';

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  privateKey = await importRsaPrivateKey(TEST_PRIVATE_KEY_PEM);
  const derived = await deriveAndExportPublicKey(privateKey, KID);
  publicKey = derived.publicKey;
});

// ── ID token ──────────────────────────────────────────────────────────────────

describe('signIdToken', () => {
  it('produces a three-part JWT string', async () => {
    const token = await signIdToken(
      { iss: 'https://idp.example.com', sub: 'user-1', aud: 'client-1' },
      privateKey,
      KID,
    );
    expect(token.split('.').length).toBe(3);
  });

  it('header contains alg=RS256 and the correct kid', async () => {
    const token = await signIdToken(
      { iss: 'https://idp.example.com', sub: 'user-1', aud: 'client-1' },
      privateKey,
      KID,
    );
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(KID);
  });

  it('payload contains required OIDC claims', async () => {
    const token = await signIdToken(
      { iss: 'https://idp.example.com', sub: 'user-42', aud: 'client-abc' },
      privateKey,
      KID,
    );
    const payload = decodeJwt(token);
    expect(payload.iss).toBe('https://idp.example.com');
    expect(payload.sub).toBe('user-42');
    expect(payload.aud).toBe('client-abc');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBe((payload.iat as number) + ID_TOKEN_TTL);
  });

  it('includes nonce when provided', async () => {
    const token = await signIdToken(
      { iss: 'https://idp.example.com', sub: 'u1', aud: 'c1', nonce: 'my-nonce' },
      privateKey,
      KID,
    );
    expect(decodeJwt(token).nonce).toBe('my-nonce');
  });

  it('verifies successfully with the corresponding public key', async () => {
    const token = await signIdToken(
      { iss: 'https://idp.example.com', sub: 'user-1', aud: 'client-1' },
      privateKey,
      KID,
    );
    await expect(validateAccessToken(token, publicKey)).resolves.toBeDefined();
  });
});

// ── Access token ──────────────────────────────────────────────────────────────

describe('signAccessToken', () => {
  it('payload contains scope and client_id claims', async () => {
    const token = await signAccessToken(
      { iss: 'https://idp.example.com', sub: 'user-1', scope: 'openid email', client_id: 'c1' },
      privateKey,
      KID,
    );
    const payload = decodeJwt(token);
    expect(payload.scope).toBe('openid email');
    expect(payload.client_id).toBe('c1');
    expect(payload.exp).toBe((payload.iat as number) + ACCESS_TOKEN_TTL);
  });
});

// ── validateAccessToken ───────────────────────────────────────────────────────

describe('validateAccessToken', () => {
  it('throws on a tampered token', async () => {
    const token = await signAccessToken(
      { iss: 'https://idp.example.com', sub: 'user-1', scope: 'openid', client_id: 'c1' },
      privateKey,
      KID,
    );
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    await expect(validateAccessToken(tampered, publicKey)).rejects.toThrow();
  });
});
