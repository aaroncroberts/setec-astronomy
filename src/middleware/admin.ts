import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

const ADMIN_KEY_HEADER = 'x-admin-api-key';

/**
 * Admin API authentication middleware.
 *
 * Verifies the X-Admin-Api-Key header against the ADMIN_API_KEY secret
 * using a constant-time comparison to prevent timing attacks.
 *
 * Returns 401 if the header is missing or incorrect.
 */
export const adminAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const provided = c.req.header(ADMIN_KEY_HEADER);

  if (!provided || !constantTimeEqual(provided, c.env.ADMIN_API_KEY)) {
    return c.json(
      { error: 'unauthorized', error_description: 'Invalid or missing admin API key' },
      401,
    );
  }

  return next();
};

/**
 * Constant-time string comparison.
 * Always compares every character even after a mismatch.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Iterate anyway to prevent length-based timing leaks (result is discarded)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      void ((a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0));
    }
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}
