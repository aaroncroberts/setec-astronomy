/**
 * KV-backed rate limiting middleware.
 *
 * Each (ip, action) pair gets a counter in KV. If the counter exceeds
 * MAX_ATTEMPTS within WINDOW_SECONDS, the request is rejected with 429.
 *
 * The KV entry TTL acts as the sliding window expiry — no cron needed.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 60;

/**
 * Returns a middleware that rate-limits requests by IP address and action name.
 *
 * Usage: app.post('/login', loginRateLimit(), handler)
 */
export function rateLimitMiddleware(action: string): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const key = `rate_limit:${action}:${ip}`;

    const raw = await c.env.OIDC_KV.get(key);
    const attempts = raw ? parseInt(raw, 10) : 0;

    if (attempts >= MAX_ATTEMPTS) {
      return c.json(
        {
          error: 'too_many_requests',
          error_description: 'Too many attempts. Please wait before trying again.',
        },
        429,
      );
    }

    // Increment counter; reset TTL on each attempt
    await c.env.OIDC_KV.put(key, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });

    return next();
  };
}

/**
 * Clears the rate limit counter for a given IP and action.
 * Should be called on successful authentication to reset the window.
 */
export async function clearRateLimit(kv: KVNamespace, action: string, ip: string): Promise<void> {
  const key = `rate_limit:${action}:${ip}`;
  await kv.delete(key);
}
