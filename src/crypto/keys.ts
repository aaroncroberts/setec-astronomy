/**
 * RSA key management utilities for RS256 JWT signing.
 *
 * All operations use the Web Crypto API, which is available natively
 * in the Cloudflare Workers runtime without polyfills.
 */

export interface JwkPublicKey {
  kty: 'RSA';
  kid: string;
  use: 'sig';
  alg: 'RS256';
  n: string;
  e: string;
}

const RSA_ALGORITHM = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
} as const;

/**
 * Imports an RSA private key from PEM format.
 * The PEM must be PKCS#8 (i.e. "BEGIN PRIVATE KEY", not "BEGIN RSA PRIVATE KEY").
 */
export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey('pkcs8', der, RSA_ALGORITHM, true, ['sign']);
}

/**
 * Derives the public key from a private key and exports it to JWKS format.
 */
export async function deriveAndExportPublicKey(
  privateKey: CryptoKey,
  kid: string,
): Promise<{ publicKey: CryptoKey; jwk: JwkPublicKey }> {
  // Export private key as JWK to extract public components (n, e)
  const exported = await crypto.subtle.exportKey('jwk', privateKey);

  // exportKey('jwk', ...) returns JsonWebKey, not ArrayBuffer
  const privateJwk = exported as JsonWebKey;

  if (!privateJwk.n || !privateJwk.e) {
    throw new Error('Exported private key JWK missing required RSA components (n, e)');
  }

  // Reconstruct the public key JWK (strip private components: d, p, q, dp, dq, qi)
  const publicJwk: JsonWebKey = {
    kty: privateJwk.kty,
    n: privateJwk.n,
    e: privateJwk.e,
    use: 'sig',
    alg: 'RS256',
    key_ops: ['verify'],
  };

  const publicKey = await crypto.subtle.importKey('jwk', publicJwk, RSA_ALGORITHM, true, [
    'verify',
  ]);

  return {
    publicKey,
    jwk: {
      kty: 'RSA',
      kid,
      use: 'sig',
      alg: 'RS256',
      n: privateJwk.n,
      e: privateJwk.e,
    },
  };
}

/**
 * Converts a PEM-encoded key to DER (ArrayBuffer).
 * Strips the header/footer lines and decodes base64.
 */
export function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
