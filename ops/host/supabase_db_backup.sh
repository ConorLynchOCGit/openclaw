#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
source "${REPO_ROOT}/ops/host/lib/postgres_client.sh"
ARCHIVE_DIR="$WORKSPACE/archives/postgres_backups"
BACKUP_ROOT=/root/backups/postgres-runtime
STAMP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RETENTION_DAYS=30
OUT="$ARCHIVE_DIR/${STAMP_ID}.md"
BACKUP_DIR="$BACKUP_ROOT/${STAMP_ID}"
BACKUP_FILE="$BACKUP_DIR/runtime-postgres.dump"
METADATA_FILE="$BACKUP_DIR/metadata.json"
CHECKSUM_FILE="$BACKUP_DIR/runtime-postgres.dump.sha256"
LATEST_LINK="$BACKUP_ROOT/latest"
CONN_FILE="$(mktemp)"

cleanup() {
  rm -f "$CONN_FILE"
}
trap cleanup EXIT

mkdir -p "$ARCHIVE_DIR" "$BACKUP_DIR"

python3 - <<'PY' "$CONN_FILE"
import json
import pathlib
import sys
import urllib.parse

config = json.loads(pathlib.Path("/root/.openclaw/openclaw.json").read_text())
runtime_url = (
    config.get("plugins", {})
    .get("entries", {})
    .get("model-memory", {})
    .get("config", {})
    .get("database", {})
    .get("url")
)
if not runtime_url:
    raise SystemExit("missing model-memory runtime database url in /root/.openclaw/openclaw.json")

parsed = urllib.parse.urlparse(runtime_url)
query = urllib.parse.parse_qs(parsed.query)
payload = {
    "host": parsed.hostname,
    "port": parsed.port or 5432,
    "database": parsed.path.lstrip("/") or "postgres",
    "user": urllib.parse.unquote(parsed.username or ""),
    "password": urllib.parse.unquote(parsed.password or ""),
    "sslmode": (query.get("sslmode") or ["require"])[0],
    "schemas": ["public", "model_memory", "runtime_context"],
    "source": "/root/.openclaw/openclaw.json#plugins.entries.model-memory.config.database.url",
}
pathlib.Path(sys.argv[1]).write_text(json.dumps(payload, indent=2) + "\n")
PY

DB_HOST="$(jq -r '.host' "$CONN_FILE")"
DB_PORT="$(jq -r '.port' "$CONN_FILE")"
DB_NAME="$(jq -r '.database' "$CONN_FILE")"
DB_USER="$(jq -r '.user' "$CONN_FILE")"
DB_PASS="$(jq -r '.password' "$CONN_FILE")"
DB_SSLMODE="$(jq -r '.sslmode' "$CONN_FILE")"
DB_SOURCE="$(jq -r '.source' "$CONN_FILE")"

DB_SERVER_VERSION="$(
  docker run --rm \
    -e PGPASSWORD="$DB_PASS" \
    -e DB_HOST="$DB_HOST" \
    -e DB_PORT="$DB_PORT" \
    -e DB_NAME="$DB_NAME" \
    -e DB_USER="$DB_USER" \
    -e DB_SSLMODE="$DB_SSLMODE" \
    "$OPENCLAW_POSTGRES_CLIENT_IMAGE" \
    psql \
      "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=$DB_SSLMODE" \
      -X -v ON_ERROR_STOP=1 -t -A -c "show server_version;"
)"

jq --arg client_image "$OPENCLAW_POSTGRES_CLIENT_IMAGE" --arg server_version "$DB_SERVER_VERSION" \
  '. + {client_image: $client_image, server_version: $server_version} | del(.password)' \
  "$CONN_FILE" > "$METADATA_FILE"

docker run --rm \
  -e PGPASSWORD="$DB_PASS" \
  -e DB_HOST="$DB_HOST" \
  -e DB_PORT="$DB_PORT" \
  -e DB_NAME="$DB_NAME" \
  -e DB_USER="$DB_USER" \
  -e DB_SSLMODE="$DB_SSLMODE" \
  -v "$BACKUP_DIR:/backup" \
  "$OPENCLAW_POSTGRES_CLIENT_IMAGE" \
  sh -lc '
    pg_dump \
      "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=$DB_SSLMODE" \
      --schema=public \
      --schema=model_memory \
      --schema=runtime_context \
      --format=custom \
      --compress=9 \
      --file=/backup/runtime-postgres.dump
  '

sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
ln -sfn "$BACKUP_DIR" "$LATEST_LINK"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

BACKUP_BYTES="$(du -sb "$BACKUP_FILE" | awk '{print $1}')"
BACKUP_SIZE="$(python3 - <<'PY' "$BACKUP_BYTES"
import sys
print(f"{int(sys.argv[1]) / (1024**2):.2f} MiB")
PY
)"

cat > /tmp/postgres_backup_report.$$ <<EOF
# Runtime Postgres Backup Report

- generated_at_utc: ${STAMP_ID}
- host: \`${DB_HOST}\`
- database: \`${DB_NAME}\`
- user: \`${DB_USER}\`
- server_version: \`${DB_SERVER_VERSION}\`
- client_image: \`${OPENCLAW_POSTGRES_CLIENT_IMAGE}\`
- schemas: \`public, model_memory, runtime_context\`
- backup_file: \`${BACKUP_FILE}\`
- metadata_file: \`${METADATA_FILE}\`
- checksum_file: \`${CHECKSUM_FILE}\`
- latest_link: \`${LATEST_LINK}\`
- retained_days: ${RETENTION_DAYS}
- backup_size: \`${BACKUP_SIZE}\`

## Reading

- This backup uses the canonical Supabase-backed runtime database URL from \`${DB_SOURCE}\`.
- It intentionally dumps only the app-owned schemas: \`public\`, \`model_memory\`, and \`runtime_context\`.
- It uses the canonical disposable PostgreSQL client image \`${OPENCLAW_POSTGRES_CLIENT_IMAGE}\`, which currently matches the runtime server major version.
- The backup format is PostgreSQL custom format for safer restore and inspection with \`pg_restore\`.
EOF

mv /tmp/postgres_backup_report.$$ "$OUT"
echo "runtime postgres backup report written: $OUT"
