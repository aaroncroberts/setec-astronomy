/**
 * Password hashing using PBKDF2 via the Web Crypto API.
 *
 * Uses 310,000 iterations (NIST SP 800-132 recommendation for SHA-256),
 * a random 16-byte salt per hash, and SHA-256 as the PRF.
 *
 * Stored format: "<salt_b64>:<hash_b64>" (both base64url-encoded).
 */

const ITERATIONS = 310_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;
const ALGORITHM = 'PBKDF2';
const HASH = 'SHA-256';
const SEPARATOR = ':';

/**
 * Hashes a plaintext password. Returns a storable string that includes
 * the salt so it can be verified later.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(plaintext, salt);
  return `${bufToB64(salt)}${SEPARATOR}${bufToB64(hash)}`;
}

/**
 * Verifies a plaintext password against a stored hash string.
 * Uses a constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  const parts = stored.split(SEPARATOR);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const salt = b64ToBuf(parts[0]);
  const expectedHash = b64ToBuf(parts[1]);
  const actualHash = await deriveKey(plaintext, new Uint8Array(salt));

  return constantTimeEqual(new Uint8Array(expectedHash), new Uint8Array(actualHash));
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function deriveKey(plaintext: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plaintext),
    ALGORITHM,
    false,
    ['deriveBits'],
  );

  return crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt,
      iterations: ITERATIONS,
      hash: HASH,
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // Use URL-safe base64 (replaces + with -, / with _, strips =)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64ToBuf(b64url: string): ArrayBuffer {
  // Restore standard base64 padding and characters
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Constant-time byte array comparison to prevent timing attacks.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // XOR — accumulates any differences without early exit
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
