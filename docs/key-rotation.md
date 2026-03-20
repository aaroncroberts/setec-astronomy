# RSA Key Rotation Runbook

This document describes how to rotate the RSA signing key without invalidating
existing tokens or causing downtime.

## Background

The OIDC IdP signs all JWTs (ID tokens, access tokens) using an RSA key pair.
The private key is stored as a Worker secret (`SIGNING_KEY_PRIVATE`).
The corresponding public key is served at `/jwks.json` so relying parties can verify tokens.

Tokens are valid for **1 hour** (`exp = iat + 3600`). A safe zero-downtime rotation
keeps both the old and new public keys in the JWKS for at least 1 hour so that
tokens signed with the old key remain verifiable during the transition.

---

## Zero-Downtime Rotation Procedure

### Phase 1: Prepare the new key

```bash
# Generate a new key pair
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out new-signing.key

# Extract the public key for reference
openssl pkey -in new-signing.key -pubout -out new-signing.pub
```

### Phase 2: Add the new public key to JWKS (dual-key window)

The current `/jwks.json` endpoint serves a single key. To support rotation, temporarily
serve both keys. Edit `src/routes/discovery.ts` to export both:

```typescript
// src/routes/discovery.ts — during rotation only
export async function handleJwks(c: Context<{ Bindings: Env }>): Promise<Response> {
  // New key (active for signing)
  const newPrivateKey = await importRsaPrivateKey(c.env.SIGNING_KEY_PRIVATE);
  const { jwk: newJwk } = await deriveAndExportPublicKey(newPrivateKey, 'key-2');

  // Old key (still valid for verification — loaded from KV or env)
  // During rotation: store old public key parameters in a Worker secret or KV
  // For simplicity, hardcode the old key's n and e parameters here temporarily
  const oldJwk: JwkPublicKey = {
    kty: 'RSA',
    kid: 'key-1',
    use: 'sig',
    alg: 'RS256',
    n: '<old-key-n-parameter>',
    e: 'AQAB',
  };

  return c.json({ keys: [newJwk, oldJwk] });
}
```

**Deploy this change before rotating the secret:**

```bash
wrangler deploy
```

### Phase 3: Rotate the signing secret

```bash
# Upload the new private key
cat new-signing.key | wrangler secret put SIGNING_KEY_PRIVATE
```

The Worker now signs new tokens with `key-2` while still serving `key-1` in the JWKS
so clients can verify tokens signed before the rotation.

### Phase 4: Wait for old tokens to expire

Wait at least **1 hour** (the token `exp` window). After this, no valid tokens
signed with the old key exist.

```bash
# Confirm no recently-issued tokens use key-1
# (optional: check your logs / access dashboard)
sleep 3600
```

### Phase 5: Remove the old key from JWKS

Revert the JWKS handler to serve only `key-2`:

```typescript
// src/routes/discovery.ts — after rotation
export async function handleJwks(c: Context<{ Bindings: Env }>): Promise<Response> {
  const privateKey = await importRsaPrivateKey(c.env.SIGNING_KEY_PRIVATE);
  const { jwk } = await deriveAndExportPublicKey(privateKey, 'key-2');
  return c.json({ keys: [jwk] });
}
```

Also update the `KID` constant in `src/routes/token.ts` and `src/routes/userinfo.ts`:

```typescript
const KID = 'key-2'; // was 'key-1'
```

```bash
wrangler deploy
```

### Phase 6: Clean up

```bash
# Delete the old key files from disk
rm signing.key new-signing.key new-signing.pub

# Rename new-signing.key → signing.key for the next rotation
```

---

## Emergency Key Rotation

If a key compromise is suspected:

1. **Immediately** rotate to a new key (Phase 3 above — skip Phase 2).
2. This will invalidate all existing tokens. Users will need to re-authenticate.
3. Notify affected users/systems.

For emergency rotation, accept the downtime window:

```bash
# Generate emergency replacement key
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out emergency.key

# Deploy immediately — existing tokens will fail validation
cat emergency.key | wrangler secret put SIGNING_KEY_PRIVATE

# Update KID in source, deploy
# Edit src/routes/token.ts: const KID = 'key-emergency-1';
wrangler deploy
```

---

## Key ID Convention

Keys are named `key-N` where N increments with each rotation:

| Rotation        | KID     | Notes                 |
| --------------- | ------- | --------------------- |
| Initial deploy  | `key-1` | Current default       |
| First rotation  | `key-2` | After dual-key window |
| Second rotation | `key-3` | And so on             |

---

## Future Improvement: Automatic Key IDs

In a future version, the `kid` can be derived deterministically from the key material
so it automatically reflects which key is in use without manual constant updates:

```typescript
// Derive a stable kid from the key's public components
const kid = jwk.n ? jwk.n.slice(0, 8) : 'key-1';
```

This removes the need to update source code during rotation.
