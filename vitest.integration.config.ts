import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// A test RSA private key — safe to commit, only used in local integration tests.
// Generated with: node -e "const {generateKeyPairSync}=require('crypto'); console.log(generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'}}).privateKey)"
// Never use this key in any deployed environment.
const TEST_SIGNING_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC1tJhV6LKuUTcW
83lREjxUP42jZvwVySOEcLXO1DjR0NInwdsPLjiDuangjzRTRu/VZPKiltqC9bNU
LHiOoDQD1a7yBVOdGUJfznl93dw8YNcnwawe7SLlgSKgtaHv6L4qh49XK7/ZEAXz
siw2zZSuwX+f5Gq3IjhrG2GSDarD3kxY8mZQoHuvxVJYfO7dODrOTt3wF0N3CKeg
kWXrk3fX4cN3kB17hSX7YviCsjJFFnD7a+5ml9Rd3p0Yz087h1zttz8tK1RC1KLs
Zg8aQIhfddC4nlDYbKwGh4fI/jvA4K7DJ/dBXk7tMzpZEhsWrzFSQ4NXJt5nMNXw
biLPKoQRAgMBAAECggEAQMhF5Z8kkVSgTPz6PEbBnpHYCDFv376J/K6Ii1iLd3a5
bnZFiRiECqa3o7m6wJQSbuTiQsiA2F8MFA8U3ljMoq9dA6mVgXWfffPpyc+/NQGb
w+9fU9lc7zFGrMCFHzk+D4CsQLp22EdHr/ZOoC1UfKe9Pj7cMzWuorUs6LsZrmHp
iS9mc/Ht2nVWceRfu8nHMokQf8+gsABY7UjbsPySjteRDCCNfNQjh7JMzTGoYmJW
iwpJZcVvBSzX8r51wmKucYZ66TYfHUmFnqQaMaVHEX+xhUE5XFGPQJXRGguJWaVQ
9HKORYpr8B9SSt8FVYFN+wdVULzZwA0KZSr+4SHvnwKBgQDlHPRTyE/4lBka+OMy
q8Gg3eR0r9ZVXt79erEKHDXZI8IHvRtr9W1jKTRyl3CDEE7s2j2YAiOBwRvK32nX
o239+LUbcr3Coh2TNaZX1YRRQi/a23RRkbtQGQp+qEAAm6tYNzPUqe+ZKGz1Boi/
I+FeKpD54V0Gj3Gx6dUh+iTIswKBgQDLB2nsyL6U4s6rZf1z5s/vEmIEqY8XrX3Z
LTEtoBYV6jKRhb/UpqzwOzdl0/VZz+bsWPYmDW4eRG7AgFsio/cn/Ka3GBwVRkZM
xvNrrDDMmAwHVDDdkvMfp8XHMyG7Z0+/R+HDsp+6lsWCoFyDP54FxQbbyP/6fNxZ
0xOl2Ar6KwKBgDrkfHFk1hmhh+qE+3G08Kq3HthXspJzNoKVnRhqM/VC2cc/duMD
TUDmAJNMFiG6eW8skhSWyCW8S7aUQxKo8ccMvRD3J4v2O//xFHcTbVWt27s4Geg1
u55VMXtpKDp/yUV9uxb5L5uA5rD9Iv1u7alU67svkMf061a+MojvUbE9AoGARhWe
FBXL7BtLGlGPp1Wyy6U93rwlYBgMjE6UXlqXpSL+J8vSx3Zt1lOqsOT1GfaxkT64
YbRbIemfjaYBT7joFY6agjO5ZgKnO9OlrbJ3+fg2lsUSRTp34KKKnFPjPgzQs4f9
wA9GIiPvtELlDI2GYBl+X5pH+tDlQ8CgVKx6RZcCgYB0RB3dOKfI2YKj2aFbMlAd
48hQQh9ib1IEFnb0ib2T+TdO5JIJS55zYSW0/6tBlkLOc1HDNpE9ifSnE0Pmp/eu
/ZeLJy7Y2Gqiz3K2jPRi6I9vHEUU6gO67GN4IuVAVXdxeAJ2TFT5MnPlCyynofzu
5ff0eshtpSHVkfgae9MWsQ==
-----END PRIVATE KEY-----`;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          SIGNING_KEY_PRIVATE: process.env['SIGNING_KEY_PRIVATE'] ?? TEST_SIGNING_KEY,
          ADMIN_API_KEY: process.env['ADMIN_API_KEY'] ?? 'test-admin-key',
          ISSUER: 'http://localhost',
        },
      },
    }),
  ],
  test: {
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
  },
});
