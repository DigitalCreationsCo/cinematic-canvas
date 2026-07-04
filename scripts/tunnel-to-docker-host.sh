#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${1:-}"
if [ -z "$REMOTE_HOST" ]; then
  echo "Usage: $0 <user@docker-host>"
  echo ""
  echo "Forwards Docker Compose service ports from the remote host to localhost"
  echo "so the Portals frontend (or other tools) on this machine can reach them."
  echo ""
  echo "Required (for frontend):"
  echo "  8000 → Portals API (HTTP + WebSocket)"
  echo ""
  echo "Optional (for debugging/CLI):"
  echo "  5432 → PostgreSQL"
  echo "  4566 → LocalStack (S3 + DynamoDB)"
  echo " 41339 → Lore Server (HTTP)"
  exit 1
fi

PORTS=(
  -L 8000:localhost:8000    # API (frontend needs this)
  -L 5432:localhost:5432    # PostgreSQL (optional)
  -L 4566:localhost:4566    # LocalStack (optional)
  -L 41339:localhost:41339  # Lore Server HTTP (optional)
)

echo "=== Portals Docker Host Tunnel ==="
echo "Remote host : $REMOTE_HOST"
echo ""
echo "Forwarding:"
printf '  localhost:%s → %s:%s\n' 8000 8000 5432 5432 4566 4566 41339 41339
echo ""
echo "On the remote machine, configure your frontend to use:"
echo "  http://localhost:8000/api/v1/"
echo ""
echo "Press Ctrl+C to stop."
echo ""

exec ssh -N "${PORTS[@]}" "$REMOTE_HOST"
