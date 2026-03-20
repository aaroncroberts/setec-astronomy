import { Hono } from 'hono';
import type { Env } from './types';
import { handleDiscovery, handleJwks } from './routes/discovery';
import { adminRouter } from './routes/admin';

/**
 * Creates the typed Hono application with all routes registered.
 */
export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // ── OIDC Discovery ────────────────────────────────────────────────────────
  app.get('/.well-known/openid-configuration', handleDiscovery);
  app.get('/jwks.json', handleJwks);

  // ── Admin API ─────────────────────────────────────────────────────────────
  app.route('/admin', adminRouter);

  return app;
}
