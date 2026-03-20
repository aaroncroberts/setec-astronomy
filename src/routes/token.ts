import type { Context } from 'hono';
import type { Env } from '../types';
import { getAuthCode, deleteAuthCode } from '../kv/store';
import { getClientById, verifyClientSecret, getAllowedScopes } from '../db/clients';
import { getUserById } from '../db/users';
import { importRsaPrivateKey, deriveAndExportPublicKey } from '../crypto/keys';
import { verifyPkceS256 } from '../crypto/pkce';
import { signIdToken, signAccessToken, ACCESS_TOKEN_TTL } from '../tokens/issue';
import { parseUserProfile } from '../db/users';

const KID = 'key-1';

/**
 * POST /token
 *
 * Implements the authorization_code grant type per RFC 6749 §4.1.3 and
 * PKCE verification per RFC 7636 §4.6.
 *
 * Returns a token response or an RFC 6749 error object.
 */
export async function handleToken(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Parse application/x-www-form-urlencoded body
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return tokenError(c, 'invalid_request', 'Could not parse request body', 400);
  }

  const grantType = form.get('grant_type');
  if (grantType !== 'authorization_code') {
    return tokenError(c, 'unsupported_grant_type', 'Only authorization_code is supported', 400);
  }

  const code = form.get('code');
  const redirectUri = form.get('redirect_uri');
  const clientId = form.get('client_id');
  const codeVerifier = form.get('code_verifier');

  if (
    typeof code !== 'string' ||
    typeof redirectUri !== 'string' ||
    typeof clientId !== 'string' ||
    typeof codeVerifier !== 'string'
  ) {
    return tokenError(c, 'invalid_request', 'Missing required parameters', 400);
  }

  // ── Load and validate client ───────────────────────────────────────────────

  const client = await getClientById(c.env.OIDC_DB, clientId);
  if (!client) {
    return tokenError(c, 'invalid_client', 'Unknown client', 401);
  }

  // Confidential clients must authenticate via client_secret
  if (client.is_confidential === 1) {
    const clientSecret = extractClientSecret(c, form);
    if (!clientSecret || !(await verifyClientSecret(client, clientSecret))) {
      return tokenError(c, 'invalid_client', 'Invalid client credentials', 401);
    }
  }

  // ── Load auth code from KV (one-time use) ─────────────────────────────────

  const codeData = await getAuthCode(c.env.OIDC_KV, code);
  if (!codeData) {
    return tokenError(c, 'invalid_grant', 'Authorization code not found or expired', 400);
  }

  // Delete immediately (one-time use, even if subsequent checks fail)
  await deleteAuthCode(c.env.OIDC_KV, code);

  // ── Validate stored values ─────────────────────────────────────────────────

  if (codeData.clientId !== clientId) {
    return tokenError(c, 'invalid_grant', 'Code was issued to a different client', 400);
  }

  if (codeData.redirectUri !== redirectUri) {
    return tokenError(c, 'invalid_grant', 'redirect_uri mismatch', 400);
  }

  // ── Verify PKCE ────────────────────────────────────────────────────────────

  const pkceValid = await verifyPkceS256(codeVerifier, codeData.codeChallenge);
  if (!pkceValid) {
    return tokenError(c, 'invalid_grant', 'code_verifier does not match code_challenge', 400);
  }

  // ── Load user ──────────────────────────────────────────────────────────────

  const user = await getUserById(c.env.OIDC_DB, codeData.userId);
  if (!user) {
    return tokenError(c, 'server_error', 'User not found', 500);
  }

  // ── Build token claims from granted scopes ────────────────────────────────

  const requestedScopes = codeData.scope.split(' ');
  const allowedClientScopes = getAllowedScopes(client);
  const grantedScopes = requestedScopes.filter((s) => allowedClientScopes.includes(s));
  const profile = parseUserProfile(user);

  const idClaims = buildIdTokenClaims(c.env.ISSUER, user, clientId, grantedScopes, profile, codeData.nonce);

  // ── Sign tokens ────────────────────────────────────────────────────────────

  const privateKey = await importRsaPrivateKey(c.env.SIGNING_KEY_PRIVATE);
  await deriveAndExportPublicKey(privateKey, KID); // warm cache / validate key

  const [idToken, accessToken] = await Promise.all([
    signIdToken(idClaims, privateKey, KID),
    signAccessToken(
      {
        iss: c.env.ISSUER,
        sub: user.id,
        scope: grantedScopes.join(' '),
        client_id: clientId,
      },
      privateKey,
      KID,
    ),
  ]);

  return c.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
    scope: grantedScopes.join(' '),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenError(
  c: Context<{ Bindings: Env }>,
  error: string,
  description: string,
  status: 400 | 401 | 500,
): Response {
  return c.json({ error, error_description: description }, status);
}

/** Extract client_secret from HTTP Basic auth header or form body */
function extractClientSecret(c: Context<{ Bindings: Env }>, form: FormData): string | null {
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6));
    const colon = decoded.indexOf(':');
    if (colon !== -1) return decoded.slice(colon + 1);
  }
  const bodySecret = form.get('client_secret');
  return typeof bodySecret === 'string' ? bodySecret : null;
}

function buildIdTokenClaims(
  issuer: string,
  user: { id: string; email: string },
  clientId: string,
  scopes: string[],
  profile: { name?: string; groups?: string[] },
  nonce?: string,
): import('../tokens/issue').IdTokenClaims {
  const claims: import('../tokens/issue').IdTokenClaims = {
    iss: issuer,
    sub: user.id,
    aud: clientId,
  };

  if (nonce) claims.nonce = nonce;
  if (scopes.includes('email')) claims.email = user.email;
  if (scopes.includes('profile')) {
    if (profile.name) claims.name = profile.name;
    if (profile.groups && profile.groups.length > 0) claims.groups = profile.groups;
  }

  return claims;
}
