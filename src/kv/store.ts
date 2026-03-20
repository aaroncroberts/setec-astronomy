/**
 * Typed KV abstraction layer.
 *
 * Centralizes all KV key construction and TTL policy so no raw string keys
 * appear elsewhere in the codebase. Each function corresponds to one logical
 * namespace and one data type.
 */

// ── TTL constants (seconds) ───────────────────────────────────────────────────

/** Authorization codes expire after 10 minutes per RFC 6749 §4.1.2 */
export const AUTH_CODE_TTL = 600;

/** OAuth state parameters expire after 10 minutes */
export const STATE_TTL = 600;

/** User sessions expire after 24 hours */
export const SESSION_TTL = 86_400;

// ── Key namespaces ────────────────────────────────────────────────────────────

// Workers KV keys have a 512-byte limit. State values from some OIDC clients
// (e.g. Cloudflare Zero Trust) can be several hundred characters. We SHA-256
// hash any value used as a state key to keep it within the limit.
async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const keys = {
  authCode: (code: string) => `auth_code:${code}`,
  session: (sessionId: string) => `session:${sessionId}`,
} as const;

// ── Data types ────────────────────────────────────────────────────────────────

export interface AuthCodeData {
  clientId: string;
  redirectUri: string;
  scope: string;
  userId: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  nonce?: string;
}

export interface StateData {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  nonce?: string;
}

export interface SessionData {
  userId: string;
  email: string;
  /** ISO 8601 timestamp when session was created */
  createdAt: string;
}

// ── Auth code operations ──────────────────────────────────────────────────────

export async function putAuthCode(
  kv: KVNamespace,
  code: string,
  data: AuthCodeData,
  ttl = AUTH_CODE_TTL,
): Promise<void> {
  await kv.put(keys.authCode(code), JSON.stringify(data), { expirationTtl: ttl });
}

export async function getAuthCode(kv: KVNamespace, code: string): Promise<AuthCodeData | null> {
  const raw = await kv.get(keys.authCode(code));
  if (raw === null) return null;
  return JSON.parse(raw) as AuthCodeData;
}

export async function deleteAuthCode(kv: KVNamespace, code: string): Promise<void> {
  await kv.delete(keys.authCode(code));
}

// ── State operations ──────────────────────────────────────────────────────────

export async function putState(
  kv: KVNamespace,
  state: string,
  data: StateData,
  ttl = STATE_TTL,
): Promise<void> {
  const key = `state:${await hashKey(state)}`;
  await kv.put(key, JSON.stringify(data), { expirationTtl: ttl });
}

export async function getState(kv: KVNamespace, state: string): Promise<StateData | null> {
  const key = `state:${await hashKey(state)}`;
  const raw = await kv.get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as StateData;
}

// ── Session operations ────────────────────────────────────────────────────────

export async function putSession(
  kv: KVNamespace,
  sessionId: string,
  data: SessionData,
  ttl = SESSION_TTL,
): Promise<void> {
  await kv.put(keys.session(sessionId), JSON.stringify(data), { expirationTtl: ttl });
}

export async function getSession(kv: KVNamespace, sessionId: string): Promise<SessionData | null> {
  const raw = await kv.get(keys.session(sessionId));
  if (raw === null) return null;
  return JSON.parse(raw) as SessionData;
}

export async function deleteSession(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(keys.session(sessionId));
}
