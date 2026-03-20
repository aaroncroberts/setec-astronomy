/**
 * PKCE (RFC 7636) S256 verification utilities.
 *
 * The token endpoint must verify that SHA-256(code_verifier) equals the
 * code_challenge stored during the authorization request.
 */

/**
 * Verifies a PKCE S256 code challenge.
 * Returns true if BASE64URL(SHA256(verifier)) == challenge.
 */
export async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const computed = base64urlEncode(new Uint8Array(digest));
  // Constant-time comparison to avoid timing oracle on PKCE
  return constantTimeEqual(computed, challenge);
}

function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}
