import { Hono } from 'hono';
import type { Env } from './types';
import { handleDiscovery, handleJwks } from './routes/discovery';
import { handleAuthorize } from './routes/authorize';
import { handleLoginForm, handleLoginPost } from './routes/login';
import { handleToken } from './routes/token';
import { rateLimitMiddleware } from './middleware/ratelimit';
import { corsMiddleware } from './middleware/cors';
import { handleUserinfo } from './routes/userinfo';
import { handleLogout } from './routes/logout';
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

  // ── Authorization & Login ─────────────────────────────────────────────────
  app.get('/authorize', handleAuthorize);
  app.get('/login', handleLoginForm);
  app.post('/login', rateLimitMiddleware('login'), handleLoginPost);

  // ── Token, Userinfo, Logout ───────────────────────────────────────────────
  app.post('/token', corsMiddleware, handleToken);
  app.get('/userinfo', corsMiddleware, handleUserinfo);
  app.post('/userinfo', corsMiddleware, handleUserinfo); // OIDC spec allows POST too
  app.options('/token', corsMiddleware);
  app.options('/userinfo', corsMiddleware);
  app.get('/logout', handleLogout);

  // ── Admin API ─────────────────────────────────────────────────────────────
  app.route('/admin', adminRouter);

  return app;
}
