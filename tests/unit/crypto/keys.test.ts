import { describe, it, expect } from 'vitest';
import {
  importRsaPrivateKey,
  deriveAndExportPublicKey,
  pemToDer,
} from '../../../src/crypto/keys';

// Real 2048-bit RSA test key (PKCS#8). Generated for test use only — DO NOT use in production.
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

describe('pemToDer', () => {
  it('strips PEM headers and decodes base64 to ArrayBuffer', () => {
    const der = pemToDer(TEST_PRIVATE_KEY_PEM);
    expect(der).toBeInstanceOf(ArrayBuffer);
    expect(der.byteLength).toBeGreaterThan(100);
  });
});

describe('importRsaPrivateKey', () => {
  it('imports a valid RSA private key PEM as a CryptoKey', async () => {
    const key = await importRsaPrivateKey(TEST_PRIVATE_KEY_PEM);
    expect(key.type).toBe('private');
    expect(key.algorithm.name).toBe('RSASSA-PKCS1-v1_5');
    expect(key.usages).toContain('sign');
  });

  it('throws on invalid PEM input', async () => {
    await expect(importRsaPrivateKey('not-a-pem')).rejects.toThrow();
  });
});

describe('deriveAndExportPublicKey', () => {
  it('returns a public CryptoKey and JWKS entry with correct fields', async () => {
    const privateKey = await importRsaPrivateKey(TEST_PRIVATE_KEY_PEM);
    const { publicKey, jwk } = await deriveAndExportPublicKey(privateKey, 'test-kid-1');

    expect(publicKey.type).toBe('public');
    expect(publicKey.usages).toContain('verify');

    // JWKS entry has all required fields per spec
    expect(jwk.kty).toBe('RSA');
    expect(jwk.kid).toBe('test-kid-1');
    expect(jwk.use).toBe('sig');
    expect(jwk.alg).toBe('RS256');
    expect(typeof jwk.n).toBe('string');
    expect(jwk.n.length).toBeGreaterThan(0);
    expect(jwk.e).toBe('AQAB'); // Standard RSA public exponent 65537
  });

  it('sign + verify round-trip works with derived key pair', async () => {
    const privateKey = await importRsaPrivateKey(TEST_PRIVATE_KEY_PEM);
    const { publicKey } = await deriveAndExportPublicKey(privateKey, 'round-trip');

    const data = new TextEncoder().encode('hello oidc');
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, data);

    expect(valid).toBe(true);
  });
});
