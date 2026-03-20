/**
 * Centralized Zod schemas for all OIDC and admin endpoint inputs.
 *
 * Every endpoint should validate through these schemas rather than doing
 * ad-hoc string checks. This ensures consistent error shapes and prevents
 * raw property access on unvalidated input.
 */

import { z } from 'zod';

// ── Authorization request (/authorize query params) ───────────────────────────

export const AuthorizeRequestSchema = z.object({
  client_id: z.string().min(1, 'client_id is required'),
  redirect_uri: z.string().url('redirect_uri must be a valid URL'),
  response_type: z.literal('code'),
  scope: z.string().min(1, 'scope is required'),
  state: z.string().min(1, 'state is required'),
  code_challenge: z.string().min(1, 'code_challenge is required'),
  code_challenge_method: z.literal('S256'),
  nonce: z.string().optional(),
});

export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>;

// ── Token request (/token body) ───────────────────────────────────────────────

export const TokenRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1, 'code is required'),
  redirect_uri: z.string().url('redirect_uri must be a valid URL'),
  client_id: z.string().min(1, 'client_id is required'),
  code_verifier: z.string().min(43, 'code_verifier must be at least 43 characters').max(128),
  client_secret: z.string().optional(),
});

export type TokenRequest = z.infer<typeof TokenRequestSchema>;

// ── Login form (/login POST body) ─────────────────────────────────────────────

export const LoginFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  state: z.string().min(1, 'state is required'),
});

export type LoginForm = z.infer<typeof LoginFormSchema>;

// ── Admin: create user ────────────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  profile: z
    .object({
      name: z.string().optional(),
      groups: z.array(z.string()).optional(),
    })
    .optional(),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

// ── Admin: create client ──────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  redirect_uris: z
    .array(z.string().url('Each redirect URI must be a valid URL'))
    .min(1, 'At least one redirect URI is required'),
  allowed_scopes: z
    .array(z.string())
    .min(1, 'At least one scope is required')
    .refine((s) => s.includes('openid'), { message: '"openid" scope is required' }),
  is_confidential: z.boolean().default(true),
});

export type CreateClient = z.infer<typeof CreateClientSchema>;
