#!/usr/bin/env bash
# provision-user.sh — Create a demo user in the IDP before running the demo.
#
# Usage:
#   IDP_URL=https://your-worker.workers.dev \
#   ADMIN_API_KEY=your-secret \
#   ./scripts/provision-user.sh
#
# Optional overrides:
#   DEMO_EMAIL=demo@example.com      (default: demo@example.com)
#   DEMO_PASSWORD=YourPassword123!   (default: DemoPass123!)
#   DEMO_NAME="Demo User"            (default: Demo User)
#   DEMO_GROUPS='["users"]'          (default: ["users","demo"])

set -euo pipefail

IDP_URL="${IDP_URL:?Set IDP_URL to your IdP base URL (e.g. https://idp.workers.dev)}"
ADMIN_API_KEY="${ADMIN_API_KEY:?Set ADMIN_API_KEY to your Admin API secret}"

DEMO_EMAIL="${DEMO_EMAIL:-demo@example.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-DemoPass123!}"
DEMO_NAME="${DEMO_NAME:-Demo User}"
DEMO_GROUPS="${DEMO_GROUPS:-["users","demo"]}"

echo ""
echo "==> Provisioning demo user in IDP"
echo "    IDP:   $IDP_URL"
echo "    Email: $DEMO_EMAIL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$IDP_URL/admin/users" \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d "{
    \"email\": \"$DEMO_EMAIL\",
    \"password\": \"$DEMO_PASSWORD\",
    \"profile\": {
      \"name\": \"$DEMO_NAME\",
      \"groups\": $DEMO_GROUPS
    }
  }")

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" = "201" ]; then
  echo "==> User provisioned successfully (201 Created)"
  echo ""
  echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"
  echo ""
  echo "==> Next steps:"
  echo "    1. Open your demo app URL (protected by Cloudflare Zero Trust)"
  echo "    2. Log in with: $DEMO_EMAIL"
  echo "    3. Use the password you set (stored in DEMO_PASSWORD)"
  echo "    4. Your name and groups will appear in the demo app"
elif [ "$HTTP_STATUS" = "409" ]; then
  echo "==> User already exists (409 Conflict) — skipping creation"
  echo "    To update the user, use PATCH /admin/users/:id"
else
  echo "==> Error: HTTP $HTTP_STATUS"
  echo "$HTTP_BODY"
  exit 1
fi
