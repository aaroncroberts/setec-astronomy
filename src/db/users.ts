import { z } from 'zod';
import type { User, UserProfile } from './types';
import type { UpdateUser, ListUsersQuery } from '../schemas';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const UserRowSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  is_active: z.union([z.literal(0), z.literal(1)]),
  profile_json: z.string(),
});

// ── Repository functions ──────────────────────────────────────────────────────

/**
 * Creates a new user record in D1.
 * The password_hash must already be a PBKDF2 hash (never plaintext).
 */
export async function createUser(
  db: D1Database,
  input: { email: string; password_hash: string; profile?: UserProfile },
): Promise<User> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const profile_json = JSON.stringify(input.profile ?? {});

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, created_at, updated_at, is_active, profile_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.email, input.password_hash, now, now, 1, profile_json)
    .run();

  return UserRowSchema.parse({
    id,
    email: input.email,
    password_hash: input.password_hash,
    created_at: now,
    updated_at: now,
    is_active: 1,
    profile_json,
  });
}

/**
 * Looks up an active user by email. Returns null if not found or deactivated.
 */
export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`)
    .bind(email)
    .first();

  if (!row) return null;
  return UserRowSchema.parse(row);
}

/**
 * Looks up a user by their UUID. Returns null if not found.
 */
export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
  if (!row) return null;
  return UserRowSchema.parse(row);
}

/**
 * Lists users with optional full-text search on email/name and pagination.
 * Returns all users regardless of is_active status (admin visibility).
 */
export async function listUsers(
  db: D1Database,
  query: Pick<ListUsersQuery, 'search' | 'limit' | 'offset'>,
): Promise<{ users: User[]; total: number }> {
  const { search, limit, offset } = query;
  const hasSearch = search !== undefined && search.length > 0;
  const like = `%${search ?? ''}%`;

  const whereClause = hasSearch ? `WHERE (email LIKE ? OR profile_json LIKE ?)` : '';
  const countBinds = hasSearch ? [like, like] : [];
  const rowBinds = hasSearch ? [like, like, limit, offset] : [limit, offset];

  const [countResult, rowResult] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as total FROM users ${whereClause}`)
      .bind(...countBinds)
      .first<{ total: number }>(),
    db
      .prepare(`SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...rowBinds)
      .all(),
  ]);

  const users = (rowResult.results ?? []).map((row) => UserRowSchema.parse(row));
  return { users, total: countResult?.total ?? 0 };
}

/**
 * Partially updates a user record. Only fields present in the patch are changed.
 * updated_at is always bumped to the current server time.
 * Returns null if no user with that id exists.
 */
export async function updateUser(
  db: D1Database,
  id: string,
  patch: Omit<UpdateUser, 'profile'> & { password_hash?: string; profile_json?: string },
): Promise<User | null> {
  const now = Math.floor(Date.now() / 1000);

  // Build SET clause from whichever fields are present in the patch.
  const sets: string[] = ['updated_at = ?'];
  const binds: unknown[] = [now];

  if (patch.email !== undefined) {
    sets.push('email = ?');
    binds.push(patch.email);
  }
  if (patch.password_hash !== undefined) {
    sets.push('password_hash = ?');
    binds.push(patch.password_hash);
  }
  if (patch.is_active !== undefined) {
    sets.push('is_active = ?');
    binds.push(patch.is_active ? 1 : 0);
  }
  if (patch.profile_json !== undefined) {
    sets.push('profile_json = ?');
    binds.push(patch.profile_json);
  }

  binds.push(id);

  await db
    .prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  return getUserById(db, id);
}

/**
 * Hard-deletes a user by ID. Returns true if a row was deleted, false if not found.
 */
export async function deleteUser(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Parses the profile_json field into a typed UserProfile object.
 */
export function parseUserProfile(user: User): UserProfile {
  try {
    return JSON.parse(user.profile_json) as UserProfile;
  } catch {
    return {};
  }
}
