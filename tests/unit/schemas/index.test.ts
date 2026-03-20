import { describe, it, expect } from 'vitest';
import {
  AuthorizeRequestSchema,
  TokenRequestSchema,
  LoginFormSchema,
  CreateUserSchema,
  CreateClientSchema,
} from '../../../src/schemas';

// ── AuthorizeRequestSchema ────────────────────────────────────────────────────

describe('AuthorizeRequestSchema', () => {
  const valid = {
    client_id: 'client-abc',
    redirect_uri: 'https://app.example.com/callback',
    response_type: 'code' as const,
    scope: 'openid email',
    state: 'random-state',
    code_challenge: 'challenge-abc',
    code_challenge_method: 'S256' as const,
  };

  it('parses a valid authorize request', () => {
    expect(AuthorizeRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects wrong response_type', () => {
    expect(AuthorizeRequestSchema.safeParse({ ...valid, response_type: 'token' }).success).toBe(
      false,
    );
  });

  it('rejects plain code_challenge_method', () => {
    expect(
      AuthorizeRequestSchema.safeParse({ ...valid, code_challenge_method: 'plain' }).success,
    ).toBe(false);
  });

  it('rejects missing state', () => {
    const { state: _s, ...rest } = valid;
    expect(AuthorizeRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts optional nonce', () => {
    expect(AuthorizeRequestSchema.safeParse({ ...valid, nonce: 'abc' }).success).toBe(true);
  });
});

// ── TokenRequestSchema ────────────────────────────────────────────────────────

describe('TokenRequestSchema', () => {
  // code_verifier minimum length is 43 per RFC 7636
  const valid = {
    grant_type: 'authorization_code' as const,
    code: 'auth-code-abc',
    redirect_uri: 'https://app.example.com/callback',
    client_id: 'client-abc',
    code_verifier: 'a'.repeat(43),
  };

  it('parses a valid token request', () => {
    expect(TokenRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short code_verifier', () => {
    expect(TokenRequestSchema.safeParse({ ...valid, code_verifier: 'short' }).success).toBe(false);
  });

  it('rejects wrong grant_type', () => {
    expect(
      TokenRequestSchema.safeParse({ ...valid, grant_type: 'client_credentials' }).success,
    ).toBe(false);
  });
});

// ── LoginFormSchema ───────────────────────────────────────────────────────────

describe('LoginFormSchema', () => {
  const valid = { email: 'alice@example.com', password: 'pw', state: 'state-123' };

  it('parses a valid login form', () => {
    expect(LoginFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(LoginFormSchema.safeParse({ ...valid, email: 'not-email' }).success).toBe(false);
  });

  it('rejects missing state', () => {
    const { state: _s, ...rest } = valid;
    expect(LoginFormSchema.safeParse(rest).success).toBe(false);
  });
});

// ── CreateUserSchema ──────────────────────────────────────────────────────────

describe('CreateUserSchema', () => {
  const valid = { email: 'alice@example.com', password: 'password123' };

  it('parses valid user creation', () => {
    expect(CreateUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short password', () => {
    expect(CreateUserSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });

  it('accepts optional profile with groups', () => {
    const result = CreateUserSchema.safeParse({
      ...valid,
      profile: { name: 'Alice', groups: ['admin'] },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.profile?.groups).toEqual(['admin']);
  });
});

// ── CreateClientSchema ────────────────────────────────────────────────────────

describe('CreateClientSchema', () => {
  const valid = {
    name: 'My App',
    redirect_uris: ['https://app.example.com/callback'],
    allowed_scopes: ['openid', 'email'],
    is_confidential: true,
  };

  it('parses valid client creation', () => {
    expect(CreateClientSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing openid scope', () => {
    expect(CreateClientSchema.safeParse({ ...valid, allowed_scopes: ['email'] }).success).toBe(
      false,
    );
  });

  it('rejects invalid redirect URI', () => {
    expect(CreateClientSchema.safeParse({ ...valid, redirect_uris: ['not-a-url'] }).success).toBe(
      false,
    );
  });

  it('defaults is_confidential to true', () => {
    const { is_confidential: _ic, ...rest } = valid;
    const result = CreateClientSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_confidential).toBe(true);
  });
});
