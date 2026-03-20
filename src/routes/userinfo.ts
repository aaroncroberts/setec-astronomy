import type { Context } from 'hono';
import type { Env } from '../types';
import { importRsaPrivateKey, deriveAndExportPublicKey } from '../crypto/keys';
import { validateAccessToken } from '../tokens/issue';
import { getUserById } from '../db/users';
import { parseUserProfile } from '../db/users';

const KID = 'key-1';

/**
 * GET /userinfo
 *
 * Returns scope-filtered user claims for the bearer presenting a valid access token.
 * Per OIDC Core 1.0 §5.3.
 */
export async function handleUserinfo(c: Context<{ Bindings: Env }>): Promise<Response> {
  // ── Extract bearer token ──────────────────────────────────────────────────

  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return unauthorized(c, 'missing_token', 'Bearer token required');
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    return unauthorized(c, 'missing_token', 'Bearer token required');
  }

  // ── Validate token ────────────────────────────────────────────────────────

  const privateKey = await importRsaPrivateKey(c.env.SIGNING_KEY_PRIVATE);
  const { publicKey } = await deriveAndExportPublicKey(privateKey, KID);

  let payload: Awaited<ReturnType<typeof validateAccessToken>>;
  try {
    payload = await validateAccessToken(token, publicKey);
  } catch {
    return unauthorized(c, 'invalid_token', 'Token is invalid or expired');
  }

  // ── Load user ─────────────────────────────────────────────────────────────

  const sub = payload.sub;
  if (!sub) {
    return unauthorized(c, 'invalid_token', 'Token missing sub claim');
  }

  const user = await getUserById(c.env.OIDC_DB, sub);
  if (!user) {
    return unauthorized(c, 'invalid_token', 'User not found');
  }

  // ── Filter claims by granted scopes ───────────────────────────────────────

  const scope = typeof payload.scope === 'string' ? payload.scope : '';
  const scopes = scope.split(' ');
  const profile = parseUserProfile(user);

  const claims: Record<string, unknown> = { sub: user.id };

  if (scopes.includes('email')) {
    claims['email'] = user.email;
    claims['email_verified'] = true; // users in this IdP are considered verified
  }

  if (scopes.includes('profile')) {
    if (profile.name) claims['name'] = profile.name;
    if (profile.groups && profile.groups.length > 0) claims['groups'] = profile.groups;
  }

  return c.json(claims);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unauthorized(c: Context<{ Bindings: Env }>, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer error="${error}", error_description="${description}"`,
    },
  });
}
