import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/crypto/password';

describe('hashPassword', () => {
  it('returns a string containing a separator', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toContain(':');
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });

  it('never returns the plaintext password', async () => {
    const password = 'my-secret-password';
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const password = 'correct-horse-battery-staple';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('returns false for empty string against real hash', async () => {
    const hash = await hashPassword('non-empty');
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('returns false for malformed stored hash', async () => {
    expect(await verifyPassword('any', 'no-separator-here')).toBe(false);
    expect(await verifyPassword('any', '')).toBe(false);
  });

  it('returns false when comparing against different password hash', async () => {
    const hash = await hashPassword('password-a');
    expect(await verifyPassword('password-b', hash)).toBe(false);
  });
});
