#!/usr/bin/env bash
# scripts/provision.sh
#
# First-time Cloudflare resource provisioning for the OIDC IdP.
#
# Automates:
#   1. D1 database creation
#   2. KV namespace creation
#   3. wrangler.toml patching with real IDs
#   4. RSA-2048 signing key generation + upload via wrangler secret
#   5. ADMIN_API_KEY generation + upload via wrangler secret
#   6. Remote D1 migrations
#
# Prerequisites:
#   wrangler v4+  (npm install -g wrangler)
#   openssl
#   Authenticated: wrangler login
#
# Usage:
#   ./scripts/provision.sh
#   ./scripts/provision.sh --db-name oidc-idp --kv-name oidc-idp
#
# Re-run safely: if the database or namespace already exists the script skips
# creation and reads the existing IDs.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

DB_NAME="oidc-idp"
KV_NAME="oidc-idp"
TOML_FILE="wrangler.toml"

# ── CLI args ──────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --db-name) DB_NAME="$2"; shift 2 ;;
    --kv-name) KV_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { echo "  ✓ $*"; }
step()  { echo; echo "── $*"; }
warn()  { echo "  ⚠ $*"; }
abort() { echo; echo "✗ $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || abort "Required tool not found: $1"
}

# ── Preflight ─────────────────────────────────────────────────────────────────

require wrangler
require openssl

echo
echo "══════════════════════════════════════════════════════"
echo "  OIDC IdP — Cloudflare Resource Provisioning"
echo "══════════════════════════════════════════════════════"

# Verify wrangler auth
if ! wrangler whoami &>/dev/null; then
  abort "Not authenticated with Cloudflare. Run: wrangler login"
fi
ACCOUNT=$(wrangler whoami 2>&1 | grep -oP '(?<=Account Name: )\S+' || echo "unknown")
info "Authenticated (account: ${ACCOUNT})"

# ── Step 1: D1 database ───────────────────────────────────────────────────────

step "D1 database"

# Check if already exists
EXISTING_DB=$(wrangler d1 list --json 2>/dev/null | \
  grep -o "\"database_id\":\"[^\"]*\"" | head -1 || true)

if wrangler d1 list --json 2>/dev/null | grep -q "\"name\":\"${DB_NAME}\""; then
  DB_ID=$(wrangler d1 list --json 2>/dev/null | \
    python3 -c "
import json,sys
dbs=json.load(sys.stdin)
for db in dbs:
    if db['name']=='${DB_NAME}':
        print(db['uuid'])
        break
  " 2>/dev/null || \
    wrangler d1 info "${DB_NAME}" 2>&1 | grep -oP '(?<=database_id: )\S+')
  info "D1 database already exists: ${DB_NAME} (${DB_ID})"
else
  CREATE_OUT=$(wrangler d1 create "${DB_NAME}" 2>&1)
  DB_ID=$(echo "${CREATE_OUT}" | grep -oP 'database_id = "\K[^"]+' || \
          echo "${CREATE_OUT}" | grep -oP '(?<=database_id = )\S+')
  [[ -z "${DB_ID}" ]] && abort "Failed to parse database_id from wrangler output:\n${CREATE_OUT}"
  info "D1 database created: ${DB_NAME} (${DB_ID})"
fi

# ── Step 2: KV namespace ──────────────────────────────────────────────────────

step "KV namespace"

if wrangler kv namespace list --json 2>/dev/null | grep -q "\"title\":\"${KV_NAME}\""; then
  KV_ID=$(wrangler kv namespace list --json 2>/dev/null | \
    python3 -c "
import json,sys
ns=json.load(sys.stdin)
for n in ns:
    if n['title']=='${KV_NAME}':
        print(n['id'])
        break
  " 2>/dev/null)
  info "KV namespace already exists: ${KV_NAME} (${KV_ID})"
else
  KV_OUT=$(wrangler kv namespace create "${KV_NAME}" 2>&1)
  KV_ID=$(echo "${KV_OUT}" | grep -oP 'id = "\K[^"]+' || \
          echo "${KV_OUT}" | grep -oP '(?<=id = )\S+')
  [[ -z "${KV_ID}" ]] && abort "Failed to parse KV namespace id from wrangler output:\n${KV_OUT}"
  info "KV namespace created: ${KV_NAME} (${KV_ID})"
fi

# ── Step 3: KV preview namespace ─────────────────────────────────────────────

KV_PREVIEW_NAME="${KV_NAME}_preview"

if wrangler kv namespace list --json 2>/dev/null | grep -q "\"title\":\"${KV_PREVIEW_NAME}\""; then
  KV_PREVIEW_ID=$(wrangler kv namespace list --json 2>/dev/null | \
    python3 -c "
import json,sys
ns=json.load(sys.stdin)
for n in ns:
    if n['title']=='${KV_PREVIEW_NAME}':
        print(n['id'])
        break
  " 2>/dev/null)
  info "KV preview namespace already exists: ${KV_PREVIEW_NAME} (${KV_PREVIEW_ID})"
else
  KV_PREVIEW_OUT=$(wrangler kv namespace create "${KV_PREVIEW_NAME}" --preview 2>&1)
  KV_PREVIEW_ID=$(echo "${KV_PREVIEW_OUT}" | grep -oP 'preview_id = "\K[^"]+' || \
                  echo "${KV_PREVIEW_OUT}" | grep -oP 'id = "\K[^"]+' | tail -1)
  [[ -z "${KV_PREVIEW_ID}" ]] && {
    warn "Could not parse preview KV id — you may need to set preview_id in wrangler.toml manually"
    KV_PREVIEW_ID="REPLACE_WITH_KV_PREVIEW_ID"
  }
  info "KV preview namespace created: ${KV_PREVIEW_NAME} (${KV_PREVIEW_ID})"
fi

# ── Step 4: Patch wrangler.toml ───────────────────────────────────────────────

step "Patching ${TOML_FILE}"

# Use sed to replace placeholder values in-place
sed -i.bak \
  -e "s|database_id = \"REPLACE_WITH_D1_DATABASE_ID\"|database_id = \"${DB_ID}\"|g" \
  -e "s|id = \"REPLACE_WITH_KV_NAMESPACE_ID\"|id = \"${KV_ID}\"|g" \
  -e "s|preview_id = \"REPLACE_WITH_KV_PREVIEW_ID\"|preview_id = \"${KV_PREVIEW_ID}\"|g" \
  "${TOML_FILE}"

rm -f "${TOML_FILE}.bak"
info "wrangler.toml updated with resource IDs"
warn "Review wrangler.toml and update ISSUER to your Worker's public URL before deploying"

# ── Step 5: RSA signing key ───────────────────────────────────────────────────

step "RSA signing key"

KEY_FILE="$(mktemp /tmp/signing-key-XXXXXX.pem)"
trap 'rm -f "${KEY_FILE}"' EXIT

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "${KEY_FILE}" 2>/dev/null
info "RSA-2048 key generated (PKCS#8 PEM)"

wrangler secret put SIGNING_KEY_PRIVATE < "${KEY_FILE}"
info "SIGNING_KEY_PRIVATE uploaded to Cloudflare secrets"

# ── Step 6: Admin API key ─────────────────────────────────────────────────────

step "Admin API key"

ADMIN_KEY="$(openssl rand -hex 32)"
printf '%s' "${ADMIN_KEY}" | wrangler secret put ADMIN_API_KEY
info "ADMIN_API_KEY uploaded to Cloudflare secrets"

# ── Step 7: Run migrations ────────────────────────────────────────────────────

step "Database migrations"

wrangler d1 migrations apply "${DB_NAME}" --remote
info "Migrations applied to ${DB_NAME}"

# ── Done ──────────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════════════════"
echo "  Provisioning complete!"
echo "══════════════════════════════════════════════════════"
echo
echo "  D1 database:    ${DB_NAME} (${DB_ID})"
echo "  KV namespace:   ${KV_NAME} (${KV_ID})"
echo
echo "  Next steps:"
echo "  1. Update ISSUER in wrangler.toml to your Worker's public URL"
echo "  2. Deploy:  wrangler deploy"
echo "  3. Verify:  curl https://your-worker.workers.dev/.well-known/openid-configuration"
echo "  4. Create initial user + OIDC client (see docs/deployment.md Step 9)"
echo
echo "  Admin API key (save this — it cannot be retrieved from Cloudflare):"
echo
echo "  ADMIN_API_KEY=${ADMIN_KEY}"
echo
