import { Hono } from 'hono';
import type { Env } from '../types';
import { adminAuth } from '../middleware/admin';
import { createUser, getUserById, listUsers, updateUser, deleteUser } from '../db/users';
import { createClient } from '../db/clients';
import { hashPassword } from '../crypto/password';
import {
  CreateUserSchema,
  CreateClientSchema,
  UpdateUserSchema,
  ListUsersQuerySchema,
} from '../schemas';

const adminRouter = new Hono<{ Bindings: Env }>();

// All admin routes require API key authentication
adminRouter.use('*', adminAuth);

// ── POST /admin/users ─────────────────────────────────────────────────────────

adminRouter.post('/users', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = CreateUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: parsed.error.issues[0]?.message ?? 'Validation failed',
      },
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
      {
        error: 'invalid_request',
        error_description: parsed.error.issues[0]?.message ?? 'Validation failed',
      },
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

// ── GET /admin/users ──────────────────────────────────────────────────────────

adminRouter.get('/users', async (c) => {
  const query = ListUsersQuerySchema.safeParse({
    search: c.req.query('search'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });

  if (!query.success) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: query.error.issues[0]?.message ?? 'Validation failed',
      },
      400,
    );
  }

  const { users, total } = await listUsers(c.env.OIDC_DB, query.data);

  return c.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      is_active: u.is_active,
      created_at: u.created_at,
      updated_at: u.updated_at,
      profile_json: u.profile_json,
    })),
    total,
    limit: query.data.limit,
    offset: query.data.offset,
  });
});

// ── GET /admin/users/:id ──────────────────────────────────────────────────────

adminRouter.get('/users/:id', async (c) => {
  const user = await getUserById(c.env.OIDC_DB, c.req.param('id'));

  if (!user) {
    return c.json({ error: 'not_found', error_description: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
    profile_json: user.profile_json,
  });
});

// ── PATCH /admin/users/:id ────────────────────────────────────────────────────

adminRouter.patch('/users/:id', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = UpdateUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: parsed.error.issues[0]?.message ?? 'Validation failed',
      },
      400,
    );
  }

  const { email, password, is_active, profile } = parsed.data;

  // Build the patch, only including fields that were actually provided.
  // exactOptionalPropertyTypes prevents passing undefined for optional fields.
  type UserPatch = Parameters<typeof updateUser>[2];
  const patch: UserPatch = {};
  if (email !== undefined) patch.email = email;
  if (is_active !== undefined) patch.is_active = is_active;
  if (password !== undefined) patch.password_hash = await hashPassword(password);
  if (profile !== undefined) patch.profile_json = JSON.stringify(profile);

  const updated = await updateUser(c.env.OIDC_DB, c.req.param('id'), patch);

  if (!updated) {
    return c.json({ error: 'not_found', error_description: 'User not found' }, 404);
  }

  return c.json({
    id: updated.id,
    email: updated.email,
    is_active: updated.is_active,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
    profile_json: updated.profile_json,
  });
});

// ── DELETE /admin/users/:id ───────────────────────────────────────────────────

adminRouter.delete('/users/:id', async (c) => {
  const deleted = await deleteUser(c.env.OIDC_DB, c.req.param('id'));

  if (!deleted) {
    return c.json({ error: 'not_found', error_description: 'User not found' }, 404);
  }

  return new Response(null, { status: 204 });
});

export { adminRouter };
