/**
 * CORS middleware for OIDC token and userinfo endpoints.
 *
 * Browser-based OIDC clients (SPAs) make cross-origin requests to /token
 * and /userinfo. We must respond with CORS headers to allow these.
 *
 * Security notes:
 * - /token allows any origin (credentials are validated via client_secret/PKCE)
 * - /userinfo allows any origin (access token provides the authorization layer)
 * - Preflight (OPTIONS) requests are handled with a 204 response
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * Adds CORS headers to token and userinfo responses.
 * Uses a permissive origin policy since token/credential validation is the security layer.
 */
export const corsMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  // Add CORS headers to the actual response
  c.res.headers.set('Access-Control-Allow-Origin', '*');
  c.res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
};
