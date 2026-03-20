import type { Context } from 'hono';
import type { Env } from '../types';
import { deleteSession } from '../kv/store';

/**
 * GET /logout (RP-Initiated Logout per OpenID Connect Session Management 1.0)
 *
 * Clears the session cookie, deletes the KV session entry, and redirects
 * to `post_logout_redirect_uri` if provided (no validation required per spec
 * for stateless clients — we accept any URI to simplify deployment).
 *
 * If no redirect URI is provided, renders a simple confirmation page.
 */
export async function handleLogout(c: Context<{ Bindings: Env }>): Promise<Response> {
  const postLogoutUri = c.req.query('post_logout_redirect_uri');

  // Delete session from KV if present
  const cookieHeader = c.req.header('cookie') ?? '';
  const sessionId = getCookieValue(cookieHeader, 'sid');
  if (sessionId) {
    await deleteSession(c.env.OIDC_KV, sessionId);
  }

  // Clear the session cookie
  const clearCookie = 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

  if (postLogoutUri) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: postLogoutUri,
        'Set-Cookie': clearCookie,
      },
    });
  }

  // Render a minimal confirmation page
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signed Out</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; background: #f5f5f5; }
    .card { background: #fff; padding: 2rem 2.5rem; border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12); text-align: center; max-width: 380px; }
    h1 { font-size: 1.4rem; color: #111; margin-bottom: 0.75rem; }
    p { color: #555; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You have been signed out</h1>
    <p>Your session has ended. You may now close this window.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'Set-Cookie': clearCookie,
    },
  });
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ?? null;
}
