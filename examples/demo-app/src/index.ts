/**
 * Demo App — Protected by Cloudflare Zero Trust
 *
 * This Worker demonstrates the OIDC IdP integration. After Zero Trust
 * authenticates the user, Cloudflare injects identity headers that this
 * Worker reads and displays.
 *
 * Headers available after Zero Trust auth:
 *   Cf-Access-Authenticated-User-Email  — the user's email
 *   Cf-Access-Jwt-Assertion             — signed JWT with full claims
 */

export default {
  async fetch(request: Request): Promise<Response> {
    const email = request.headers.get('Cf-Access-Authenticated-User-Email');
    const jwtAssertion = request.headers.get('Cf-Access-Jwt-Assertion');

    // Parse claims from the Zero Trust JWT (no signature verification needed —
    // Cloudflare already verified it before forwarding the request)
    let claims: Record<string, unknown> = {};
    if (jwtAssertion) {
      try {
        const payload = jwtAssertion.split('.')[1];
        if (payload) {
          claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        }
      } catch {
        // Malformed JWT — show what we have
      }
    }

    const name = (claims['name'] as string) ?? email ?? 'Unknown';
    const groups = (claims['groups'] as string[]) ?? [];
    const sub = (claims['sub'] as string) ?? '—';
    const iss = (claims['iss'] as string) ?? '—';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Demo App — Authenticated</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 2.5rem;
      max-width: 520px;
      width: 100%;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 1.5rem;
    }
    .badge::before { content: '●'; color: #10b981; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #111; margin-bottom: 0.25rem; }
    .subtitle { color: #6b7280; font-size: 0.95rem; margin-bottom: 2rem; }
    .field { margin-bottom: 1.25rem; }
    .label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
      margin-bottom: 4px;
    }
    .value {
      font-size: 0.95rem;
      color: #111;
      word-break: break-all;
    }
    .groups { display: flex; flex-wrap: wrap; gap: 6px; }
    .group-tag {
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 0.8rem;
      font-weight: 500;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .divider { border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0; }
    .footer { font-size: 0.8rem; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Authenticated</div>
    <h1>Welcome, ${escapeHtml(name)}</h1>
    <p class="subtitle">You're signed in via Cloudflare Zero Trust.</p>

    <div class="field">
      <div class="label">Email</div>
      <div class="value">${escapeHtml(email ?? '—')}</div>
    </div>

    <div class="field">
      <div class="label">Subject (sub)</div>
      <div class="value">${escapeHtml(sub)}</div>
    </div>

    ${
      groups.length > 0
        ? `<div class="field">
      <div class="label">Groups</div>
      <div class="groups">
        ${groups.map((g) => `<span class="group-tag">${escapeHtml(g)}</span>`).join('')}
      </div>
    </div>`
        : ''
    }

    <hr class="divider" />

    <div class="field">
      <div class="label">Identity Provider</div>
      <div class="value">${escapeHtml(iss)}</div>
    </div>

    <p class="footer">
      Protected by <a href="https://www.cloudflare.com/zero-trust/" target="_blank">Cloudflare Zero Trust</a>
      · OIDC IdP: <a href="${escapeHtml(iss)}/.well-known/openid-configuration" target="_blank">${escapeHtml(iss)}</a>
    </p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
