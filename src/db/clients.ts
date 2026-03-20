import { z } from 'zod';
import { hashPassword, verifyPassword } from '../crypto/password';
import type { Client } from './types';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ClientRowSchema = z.object({
  id: z.string(),
  client_secret: z.string(),
  name: z.string(),
  redirect_uris: z.string(),
  allowed_scopes: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  is_confidential: z.union([z.literal(0), z.literal(1)]),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the parsed redirect_uris array from a Client row. */
export function getRedirectUris(client: Client): string[] {
  try {
    return JSON.parse(client.redirect_uris) as string[];
  } catch {
    return [];
  }
}

/** Returns the parsed allowed_scopes array from a Client row. */
export function getAllowedScopes(client: Client): string[] {
  try {
    return JSON.parse(client.allowed_scopes) as string[];
  } catch {
    return [];
  }
}

// ── Repository functions ──────────────────────────────────────────────────────

export interface CreateClientResult {
  client: Client;
  /** The plaintext client secret — shown once, never stored in plaintext */
  clientSecret: string;
}

/**
 * Creates a new OIDC client. Generates and hashes the client secret.
 * Returns the plaintext secret once so it can be shown to the operator.
 */
export async function createClient(
  db: D1Database,
  input: {
    name: string;
    redirectUris: string[];
    allowedScopes: string[];
    isConfidential: boolean;
  },
): Promise<CreateClientResult> {
  const id = crypto.randomUUID();
  const plaintextSecret = crypto.randomUUID() + crypto.randomUUID(); // ~72 chars of entropy
  const hashedSecret = await hashPassword(plaintextSecret);
  const now = Math.floor(Date.now() / 1000);

  const redirect_uris = JSON.stringify(input.redirectUris);
  const allowed_scopes = JSON.stringify(input.allowedScopes);
  const is_confidential = input.isConfidential ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO clients (id, client_secret, name, redirect_uris, allowed_scopes, created_at, updated_at, is_confidential)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, hashedSecret, input.name, redirect_uris, allowed_scopes, now, now, is_confidential)
    .run();

  const client = ClientRowSchema.parse({
    id,
    client_secret: hashedSecret,
    name: input.name,
    redirect_uris,
    allowed_scopes,
    created_at: now,
    updated_at: now,
    is_confidential,
  });

  return { client, clientSecret: plaintextSecret };
}

/**
 * Looks up an OIDC client by client_id. Returns null if not found.
 */
export async function getClientById(db: D1Database, id: string): Promise<Client | null> {
  const row = await db.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  if (!row) return null;
  return ClientRowSchema.parse(row);
}

/**
 * Verifies a plaintext client secret against the stored hash.
 */
export async function verifyClientSecret(client: Client, secret: string): Promise<boolean> {
  return verifyPassword(secret, client.client_secret);
}
