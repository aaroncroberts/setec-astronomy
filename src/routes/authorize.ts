import type { Context } from 'hono';
import type { Env } from '../types';
import { getClientById, getRedirectUris, getAllowedScopes } from '../db/clients';
import { getSession, putState } from '../kv/store';
import { generateId } from '../crypto/random';

/**
 * GET /authorize
 *
 * Validates the Authorization Code + PKCE request per OIDC Core 1.0 §3.1.2.
 * On success:
 *   - If the user has an active session → generate auth code and redirect back to client
 *   - Otherwise → store state in KV and redirect to /login
 *
 * Error handling per RFC 6749 §4.1.2.1:
 *   - redirect_uri mismatch → 400 (never redirect)
 *   - all other validation errors → redirect to redirect_uri?error=…
 */
export async function handleAuthorize(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query();

  const clientId = q['client_id'];
  const redirectUri = q['redirect_uri'];
  const responseType = q['response_type'];
  const scope = q['scope'];
  const state = q['state'];
  const codeChallenge = q['code_challenge'];
  const codeChallengeMethod = q['code_challenge_method'];
  const nonce = q['nonce'];

  // ── Validate client_id (required before redirect_uri check) ────────────────

  if (!clientId) {
    return c.json({ error: 'invalid_request', error_description: 'Missing client_id' }, 400);
  }

  const client = await getClientById(c.env.OIDC_DB, clientId);
  if (!client) {
    return c.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 400);
  }

  // ── Validate redirect_uri — do NOT redirect on mismatch ───────────────────

  if (!redirectUri) {
    return c.json({ error: 'invalid_request', error_description: 'Missing redirect_uri' }, 400);
  }

  const allowedUris = getRedirectUris(client);
  if (!allowedUris.includes(redirectUri)) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'redirect_uri does not match registered URIs',
      },
      400,
    );
  }

  // ── From here all errors redirect to redirect_uri ─────────────────────────

  const errorRedirect = (error: string, description: string): Response => {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  };

  if (responseType !== 'code') {
    return errorRedirect('unsupported_response_type', 'Only response_type=code is supported');
  }

  if (!scope) {
    return errorRedirect('invalid_scope', 'Missing scope parameter');
  }

  const requestedScopes = scope.split(' ');
  if (!requestedScopes.includes('openid')) {
    return errorRedirect('invalid_scope', '"openid" scope is required');
  }

  const allowedScopes = getAllowedScopes(client);
  const unauthorizedScopes = requestedScopes.filter((s) => !allowedScopes.includes(s));
  if (unauthorizedScopes.length > 0) {
    return errorRedirect('invalid_scope', `Scope(s) not allowed: ${unauthorizedScopes.join(' ')}`);
  }

  if (!state) {
    return errorRedirect('invalid_request', 'state parameter is required');
  }

  if (!codeChallenge) {
    return errorRedirect('invalid_request', 'code_challenge is required');
  }

  if (codeChallengeMethod !== 'S256') {
    return errorRedirect('invalid_request', 'code_challenge_method must be S256');
  }

  // ── Check for existing session ────────────────────────────────────────────

  const sessionCookie = getCookieValue(c.req.header('cookie') ?? '', 'sid');

  if (sessionCookie) {
    const session = await getSession(c.env.OIDC_KV, sessionCookie);
    if (session) {
      // Active session found — store auth code and redirect to client
      const { putAuthCode } = await import('../kv/store');
      const code = generateId(32);
      await putAuthCode(c.env.OIDC_KV, code, {
        clientId,
        redirectUri,
        scope,
        userId: session.userId,
        codeChallenge,
        codeChallengeMethod: 'S256',
        ...(nonce ? { nonce } : {}),
      });

      const successUrl = new URL(redirectUri);
      successUrl.searchParams.set('code', code);
      successUrl.searchParams.set('state', state);
      return c.redirect(successUrl.toString(), 302);
    }
  }

  // ── No session — store state in KV and redirect to login ─────────────────

  await putState(c.env.OIDC_KV, state, {
    clientId,
    redirectUri,
    scope,
    codeChallenge,
    codeChallengeMethod: 'S256',
    ...(nonce ? { nonce } : {}),
  });

  const loginUrl = new URL(`${c.env.ISSUER}/login`);
  loginUrl.searchParams.set('state', state);
  return c.redirect(loginUrl.toString(), 302);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ?? null;
}
