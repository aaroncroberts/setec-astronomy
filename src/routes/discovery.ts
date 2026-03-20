import type { Context } from 'hono';
import type { Env } from '../types';
import { deriveAndExportPublicKey, importRsaPrivateKey } from '../crypto/keys';

/**
 * OIDC Discovery Document
 *
 * GET /.well-known/openid-configuration
 *
 * Returns the full OIDC Discovery document per:
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 */
export function handleDiscovery(c: Context<{ Bindings: Env }>): Response {
  const issuer = c.env.ISSUER.replace(/\/$/, ''); // strip trailing slash

  const discovery = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/jwks.json`,
    end_session_endpoint: `${issuer}/logout`,

    // Response and grant types
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],

    // Token signing
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],

    // Scopes and claims
    scopes_supported: ['openid', 'email', 'profile'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'email',
      'email_verified',
      'name',
      'groups',
    ],

    // PKCE
    code_challenge_methods_supported: ['S256'],

    // UI
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  };

  return c.json(discovery);
}

/**
 * JWKS Endpoint
 *
 * GET /jwks.json
 *
 * Returns the current public signing key(s) in JWKS format.
 * The kid here must match the kid embedded in issued JWT headers.
 */
export async function handleJwks(c: Context<{ Bindings: Env }>): Promise<Response> {
  const privateKey = await importRsaPrivateKey(c.env.SIGNING_KEY_PRIVATE);
  // kid is derived from the issuer to be deterministic across deployments
  const kid = `${c.env.ISSUER.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '-')}-1`;
  const { jwk } = await deriveAndExportPublicKey(privateKey, kid);

  return c.json({ keys: [jwk] });
}
