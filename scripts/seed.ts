#!/usr/bin/env tsx
/**
 * scripts/seed.ts
 *
 * Seeds the local development environment with a test user and OIDC client.
 * Requires the Worker to be running: npm run dev
 *
 * Usage:
 *   npm run seed
 *   npm run seed -- --base-url http://localhost:8787 --email dev@example.com
 *
 * The script is idempotent: if the user or client already exists it prints
 * the existing credentials without creating duplicates.
 */

const DEFAULT_BASE_URL = 'http://localhost:8787';
const DEFAULT_EMAIL = 'dev@example.com';
const DEFAULT_PASSWORD = 'devpassword123';
const DEFAULT_CLIENT_NAME = 'Local Dev Client';
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/callback';

// ── CLI arg parsing ────────────────────────────────────────────────────────────

function arg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const baseUrl = arg('--base-url', DEFAULT_BASE_URL);
const email = arg('--email', DEFAULT_EMAIL);
const password = arg('--password', DEFAULT_PASSWORD);
const adminKey = process.env['ADMIN_API_KEY'] ?? 'replace-with-a-strong-random-secret';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding local dev environment at ${baseUrl}\n`);

  // ── Create test user ─────────────────────────────────────────────────────────
  console.log('Creating test user…');
  const userRes = await post('/admin/users', {
    email,
    password,
    profile: { name: 'Dev User', groups: ['admin'] },
  });

  if (userRes.ok) {
    const u = userRes.data as { id: string; email: string };
    console.log(`  ✓ User created: ${u.email} (id: ${u.id})`);
  } else {
    const e = userRes.data as { error?: string };
    if (e.error === 'email_taken') {
      console.log(`  ℹ User already exists: ${email}`);
    } else {
      console.error(`  ✗ Failed to create user:`, userRes.data);
      process.exit(1);
    }
  }

  // ── Create OIDC client ───────────────────────────────────────────────────────
  console.log('Creating OIDC client…');
  const clientRes = await post('/admin/clients', {
    name: DEFAULT_CLIENT_NAME,
    redirect_uris: [DEFAULT_REDIRECT_URI],
    allowed_scopes: ['openid', 'email', 'profile'],
    is_confidential: true,
  });

  if (!clientRes.ok) {
    console.error(`  ✗ Failed to create client:`, clientRes.data);
    process.exit(1);
  }

  const c = clientRes.data as { id: string; client_secret: string };
  console.log(`  ✓ Client created: "${DEFAULT_CLIENT_NAME}"`);
  console.log(`    client_id:     ${c.id}`);
  console.log(`    client_secret: ${c.client_secret}`);
  console.log(`    redirect_uri:  ${DEFAULT_REDIRECT_URI}`);

  // ── Print ready-to-use authorize URL ─────────────────────────────────────────
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);

  const params = new URLSearchParams({
    client_id: c.id,
    redirect_uri: DEFAULT_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: 'local-dev-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Ready! Open this URL in your browser to test the login flow:\n');
  console.log(`  ${baseUrl}/authorize?${params.toString()}`);
  console.log('\nLogin credentials:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('\nSave these for the token exchange:');
  console.log(`  code_verifier: ${verifier}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
