import { describe, it, expect, beforeEach } from 'vitest';
import { KVMock } from '../helpers/kv-mock';
import {
  AUTH_CODE_TTL,
  STATE_TTL,
  SESSION_TTL,
  putAuthCode,
  getAuthCode,
  deleteAuthCode,
  putState,
  getState,
  putSession,
  getSession,
  deleteSession,
  type AuthCodeData,
  type StateData,
  type SessionData,
} from '../../../src/kv/store';

let kv: KVNamespace;

beforeEach(() => {
  kv = new KVMock().asKV();
});

// ── TTL constants ─────────────────────────────────────────────────────────────

describe('TTL constants', () => {
  it('AUTH_CODE_TTL is 600 seconds', () => {
    expect(AUTH_CODE_TTL).toBe(600);
  });

  it('STATE_TTL is 600 seconds', () => {
    expect(STATE_TTL).toBe(600);
  });

  it('SESSION_TTL is 86400 seconds', () => {
    expect(SESSION_TTL).toBe(86_400);
  });
});

// ── Auth code ─────────────────────────────────────────────────────────────────

describe('Auth code operations', () => {
  const data: AuthCodeData = {
    clientId: 'client-abc',
    redirectUri: 'https://app.example.com/callback',
    scope: 'openid email',
    userId: 'user-123',
    codeChallenge: 'abc123challenge',
    codeChallengeMethod: 'S256',
  };

  it('put and get round-trips correctly', async () => {
    await putAuthCode(kv, 'code-xyz', data);
    const result = await getAuthCode(kv, 'code-xyz');
    expect(result).toEqual(data);
  });

  it('get returns null for missing code', async () => {
    const result = await getAuthCode(kv, 'nonexistent');
    expect(result).toBeNull();
  });

  it('delete removes the code', async () => {
    await putAuthCode(kv, 'code-del', data);
    await deleteAuthCode(kv, 'code-del');
    const result = await getAuthCode(kv, 'code-del');
    expect(result).toBeNull();
  });

  it('preserves optional nonce field', async () => {
    const withNonce = { ...data, nonce: 'my-nonce' };
    await putAuthCode(kv, 'code-nonce', withNonce);
    const result = await getAuthCode(kv, 'code-nonce');
    expect(result?.nonce).toBe('my-nonce');
  });
});

// ── State ─────────────────────────────────────────────────────────────────────

describe('State operations', () => {
  const data: StateData = {
    clientId: 'client-abc',
    redirectUri: 'https://app.example.com/callback',
    scope: 'openid',
    codeChallenge: 'ch123',
    codeChallengeMethod: 'S256',
  };

  it('put and get round-trips correctly', async () => {
    await putState(kv, 'state-abc', data);
    const result = await getState(kv, 'state-abc');
    expect(result).toEqual(data);
  });

  it('get returns null for missing state', async () => {
    expect(await getState(kv, 'no-such-state')).toBeNull();
  });
});

// ── Session ───────────────────────────────────────────────────────────────────

describe('Session operations', () => {
  const data: SessionData = {
    userId: 'user-42',
    email: 'alice@example.com',
    createdAt: '2026-03-20T00:00:00Z',
  };

  it('put and get round-trips correctly', async () => {
    await putSession(kv, 'sess-001', data);
    const result = await getSession(kv, 'sess-001');
    expect(result).toEqual(data);
  });

  it('get returns null for missing session', async () => {
    expect(await getSession(kv, 'no-sess')).toBeNull();
  });

  it('delete removes the session', async () => {
    await putSession(kv, 'sess-del', data);
    await deleteSession(kv, 'sess-del');
    expect(await getSession(kv, 'sess-del')).toBeNull();
  });

  it('different session IDs are independent', async () => {
    await putSession(kv, 'sess-a', { ...data, userId: 'user-a' });
    await putSession(kv, 'sess-b', { ...data, userId: 'user-b' });
    expect((await getSession(kv, 'sess-a'))?.userId).toBe('user-a');
    expect((await getSession(kv, 'sess-b'))?.userId).toBe('user-b');
  });
});
