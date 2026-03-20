import { z } from 'zod';
import type { User, UserProfile } from './types';

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
 * Parses the profile_json field into a typed UserProfile object.
 */
export function parseUserProfile(user: User): UserProfile {
  try {
    return JSON.parse(user.profile_json) as UserProfile;
  } catch {
    return {};
  }
}
