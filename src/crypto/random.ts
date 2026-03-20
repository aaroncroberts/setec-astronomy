/**
 * Cryptographically random ID generation using the Web Crypto API.
 */

/**
 * Generates a URL-safe base64url-encoded random identifier.
 * @param byteLength - number of random bytes (output length ≈ 4/3 × byteLength, no padding)
 */
export function generateId(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

function base64url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
