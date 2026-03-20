/**
 * JWT issuance utilities for OIDC ID tokens and access tokens.
 *
 * Uses the `jose` library which is designed for Web Crypto API and runs
 * natively in Cloudflare Workers without Node.js polyfills.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/** Common claims required by OIDC Core 1.0 §2 */
export interface IdTokenClaims {
  /** Issuer — must match the discovery document's `issuer` field */
  iss: string;
  /** Subject — the user's unique ID */
  sub: string;
  /** Audience — the client_id that requested the token */
  aud: string;
  /** Nonce from the authorization request (required when provided) */
  nonce?: string;
  /** Email claim (included when `email` scope was requested) */
  email?: string;
  /** Name claim (included when `profile` scope was requested) */
  name?: string;
  /** Groups/roles (non-standard, included when `profile` scope was requested) */
  groups?: string[];
}

export interface AccessTokenClaims {
  iss: string;
  sub: string;
  /** Authorized scopes space-separated */
  scope: string;
  /** Client ID the token was issued to */
  client_id: string;
}

/** Token lifetimes */
export const ID_TOKEN_TTL = 3_600; // 1 hour
export const ACCESS_TOKEN_TTL = 3_600; // 1 hour

/**
 * Signs an OIDC ID token using RS256.
 *
 * @param claims - Required and optional claims (exp/iat set automatically)
 * @param privateKey - CryptoKey imported via importRsaPrivateKey()
 * @param kid - Key ID matching the JWKS entry
 */
export async function signIdToken(
  claims: IdTokenClaims,
  privateKey: CryptoKey,
  kid: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const builder = new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + ID_TOKEN_TTL);

  return builder.sign(privateKey);
}

/**
 * Signs an OIDC access token using RS256.
 */
export async function signAccessToken(
  claims: AccessTokenClaims,
  privateKey: CryptoKey,
  kid: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL)
    .sign(privateKey);
}

/**
 * Validates an access token against a public key.
 * Throws if the token is expired, has wrong algorithm, or is tampered.
 */
export async function validateAccessToken(
  token: string,
  publicKey: CryptoKey,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ['RS256'],
  });
  return payload;
}
