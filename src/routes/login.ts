import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { getUserByEmail } from '../db/users';
import { verifyPassword } from '../crypto/password';
import { putSession, getState, SESSION_TTL } from '../kv/store';
import { generateId } from '../crypto/random';

/**
 * GET /login
 *
 * Renders the HTML login form. The `state` query param is threaded through
 * as a hidden field so POST /login can resume the OIDC flow.
 *
 * No external dependencies — inline CSS only for maximum reliability
 * and to avoid Content Security Policy complications.
 */
export function handleLoginForm(c: Context<{ Bindings: Env }>): Response {
  const state = c.req.query('state') ?? '';
  const errorParam = c.req.query('error');
  const errorMessage = errorParam ? decodeURIComponent(errorParam) : null;

  const html = buildLoginHtml({ state, errorMessage });
  return c.html(html, 200);
}

interface LoginPageOptions {
  state: string;
  errorMessage: string | null;
}

function buildLoginHtml({ state, errorMessage }: LoginPageOptions): string {
  const errorHtml = errorMessage
    ? `<div class="error" role="alert">${escapeHtml(errorMessage)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
    }
    h1 { font-size: 1.5rem; font-weight: 600; color: #111; margin-bottom: 1.5rem; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      color: #b91c1c;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
    }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem; }
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.15s;
      margin-bottom: 1rem;
    }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
    button[type="submit"] {
      width: 100%;
      padding: 0.75rem;
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #4f46e5; }
    button:focus-visible { outline: 3px solid #c7d2fe; outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign In</h1>
    ${errorHtml}
    <form method="POST" action="/login" novalidate>
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <div>
        <label for="email">Email address</label>
        <input
          type="email"
          id="email"
          name="email"
          autocomplete="email"
          required
          autofocus
        >
      </div>
      <div>
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          autocomplete="current-password"
          required
        >
      </div>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

/**
 * POST /login
 *
 * Validates email/password credentials, creates a KV-backed session,
 * sets an HttpOnly session cookie, then redirects back to /authorize so
 * the OIDC flow can complete and issue an authorization code.
 */
export async function handleLoginPost(
  c: Context<{ Bindings: Env }>,
  _next: Next,
): Promise<Response> {
  // Parse application/x-www-form-urlencoded body
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return redirectToLoginWithError(c.env.ISSUER, '', 'invalid_request');
  }

  const email = formData.get('email');
  const password = formData.get('password');
  const state = formData.get('state') ?? '';

  if (typeof email !== 'string' || typeof password !== 'string' || typeof state !== 'string') {
    return redirectToLoginWithError(c.env.ISSUER, String(state), 'invalid_request');
  }

  // Verify state exists in KV (binds the login to an active OIDC request)
  const stateData = await getState(c.env.OIDC_KV, state);
  if (!stateData) {
    return redirectToLoginWithError(c.env.ISSUER, state, 'invalid_request');
  }

  // Look up user and verify password
  const user = await getUserByEmail(c.env.OIDC_DB, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return redirectToLoginWithError(c.env.ISSUER, state, 'Invalid+credentials');
  }

  // Create session in KV
  const sessionId = generateId(32);
  await putSession(
    c.env.OIDC_KV,
    sessionId,
    {
      userId: user.id,
      email: user.email,
      createdAt: new Date().toISOString(),
    },
    SESSION_TTL,
  );

  // Build redirect back to /authorize with original params
  const authorizeUrl = new URL(`${c.env.ISSUER}/authorize`);
  authorizeUrl.searchParams.set('client_id', stateData.clientId);
  authorizeUrl.searchParams.set('redirect_uri', stateData.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', stateData.scope);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', stateData.codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', stateData.codeChallengeMethod);
  if (stateData.nonce) authorizeUrl.searchParams.set('nonce', stateData.nonce);

  // Set HttpOnly session cookie and redirect
  const cookie = [
    `sid=${sessionId}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL}`,
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': cookie,
    },
  });
}

function redirectToLoginWithError(issuer: string, state: string, error: string): Response {
  const url = new URL(`${issuer}/login`);
  if (state) url.searchParams.set('state', state);
  url.searchParams.set('error', error);
  return Response.redirect(url.toString(), 302);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
