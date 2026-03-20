import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { adminAuth } from '../middleware/admin';
import { createUser } from '../db/users';
import { createClient } from '../db/clients';
import { hashPassword } from '../crypto/password';

const adminRouter = new Hono<{ Bindings: Env }>();

// All admin routes require API key authentication
adminRouter.use('*', adminAuth);

// ── Schema definitions ────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  profile: z
    .object({
      name: z.string().optional(),
      groups: z.array(z.string()).optional(),
    })
    .optional(),
});

const CreateClientSchema = z.object({
  name: z.string().min(1, { message: 'Client name is required' }),
  redirect_uris: z
    .array(z.string().url({ message: 'Each redirect URI must be a valid URL' }))
    .min(1, { message: 'At least one redirect URI is required' }),
  allowed_scopes: z
    .array(z.string())
    .min(1, { message: 'At least one scope is required' })
    .refine((s) => s.includes('openid'), { message: '"openid" scope is required' }),
  is_confidential: z.boolean().default(true),
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

adminRouter.post('/users', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = CreateUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'invalid_request', error_description: parsed.error.issues[0]?.message ?? 'Validation failed' },
      400,
    );
  }

  const { email, password, profile } = parsed.data;
  const password_hash = await hashPassword(password);

  const user = await createUser(c.env.OIDC_DB, {
    email,
    password_hash,
    ...(profile ? { profile: profile as import('../db/types').UserProfile } : {}),
  });

  // Return the user without the password hash
  return c.json(
    {
      id: user.id,
      email: user.email,
      is_active: user.is_active,
      created_at: user.created_at,
      profile_json: user.profile_json,
    },
    201,
  );
});

// ── POST /admin/clients ───────────────────────────────────────────────────────

adminRouter.post('/clients', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = CreateClientSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'invalid_request', error_description: parsed.error.issues[0]?.message ?? 'Validation failed' },
      400,
    );
  }

  const { name, redirect_uris, allowed_scopes, is_confidential } = parsed.data;

  const { client, clientSecret } = await createClient(c.env.OIDC_DB, {
    name,
    redirectUris: redirect_uris,
    allowedScopes: allowed_scopes,
    isConfidential: is_confidential,
  });

  // client_secret is returned ONCE here — it is never retrievable after this response
  return c.json(
    {
      client_id: client.id,
      client_secret: clientSecret,
      name: client.name,
      redirect_uris: JSON.parse(client.redirect_uris) as string[],
      allowed_scopes: JSON.parse(client.allowed_scopes) as string[],
      is_confidential: client.is_confidential === 1,
      created_at: client.created_at,
    },
    201,
  );
});

export { adminRouter };
