#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QUERY_FILE="$SCRIPT_DIR/GITHUB_DIGEST_QUERY.sql"
N8N_CONTAINER="${N8N_CONTAINER:-webhook-gateway-n8n-1}"
SEND_HELPER="${SEND_HELPER:-$REPO_ROOT/ops/telegram/send_chief_telegram.sh}"
POSTGRES_CLIENT_IMAGE="${OPENCLAW_POSTGRES_CLIENT_IMAGE:-postgres:17-alpine}"

get_db_var() {
  docker exec "$N8N_CONTAINER" sh -lc "printf %s \"\${$1}\""
}

DB_HOST="$(get_db_var DB_POSTGRESDB_HOST)"
DB_PORT="$(get_db_var DB_POSTGRESDB_PORT)"
DB_NAME="$(get_db_var DB_POSTGRESDB_DATABASE)"
DB_USER="$(get_db_var DB_POSTGRESDB_USER)"
DB_PASS="$(get_db_var DB_POSTGRESDB_PASSWORD)"
SQL="$(tr '\n' ' ' < "$QUERY_FILE")"

ROWS="$(
  docker run --rm \
    -e PGPASSWORD="$DB_PASS" \
    "$POSTGRES_CLIENT_IMAGE" \
    psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require" \
    -F $'\t' \
    -Atc "$SQL"
)"

if [ -z "$ROWS" ]; then
  SUMMARY=$'GitHub Digest (last 24h)\n\nNo signed GitHub events found.'
else
  SUMMARY=$'GitHub Digest (last 24h)\n\n'
  INDEX=1
  while IFS=$'\t' read -r REPO EVENT ACTION COUNT LATEST; do
    [ -n "${REPO:-}" ] || continue
    SUMMARY+="$INDEX. $REPO — $EVENT / $ACTION — $COUNT event(s) — latest $LATEST"$'\n'
    INDEX=$((INDEX + 1))
  done <<< "$ROWS"
  SUMMARY="${SUMMARY%$'\n'}"
fi

echo "[$(date -u +%FT%TZ)] GitHub digest summary prepared"
printf '%s\n' "$SUMMARY"

"$SEND_HELPER" "$SUMMARY"
