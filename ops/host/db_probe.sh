#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBHOOK_GATEWAY_ROOT="${WEBHOOK_GATEWAY_ROOT:-/root/services/webhook-gateway}"

cd "$WEBHOOK_GATEWAY_ROOT"
source "${REPO_ROOT}/ops/host/lib/postgres_client.sh"

SEND_HELPER="${REPO_ROOT}/ops/telegram/send_chief_telegram.sh"

send_alert() {
  "${SEND_HELPER}" "$1" >/dev/null
}

set +e
OUTPUT="$(
cat <<'SQL' | docker run --rm --env-file .env -i "$OPENCLAW_POSTGRES_CLIENT_IMAGE" sh -lc '
export PGPASSWORD="$DB_POSTGRESDB_PASSWORD"
SSLMODE=require
case "${DB_POSTGRESDB_SSL_ENABLED:-true}" in
  false|0|no) SSLMODE=disable ;;
esac

psql \
  "host=${DB_POSTGRESDB_HOST} port=${DB_POSTGRESDB_PORT} dbname=${DB_POSTGRESDB_DATABASE} user=${DB_POSTGRESDB_USER} sslmode=${SSLMODE}" \
  -v ON_ERROR_STOP=1 \
  -t -A -F "|"
' 2>&1
select
  (exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inbound_events'))::int,
  (exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'intake_events'))::int,
  (exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'operator_work_queue'))::int;
SQL
)"
STATUS=$?
set -e

echo "${OUTPUT}"

if [ "${STATUS}" -ne 0 ]; then
  send_alert "OpenClaw DB probe alert: direct DB probe failed on $(hostname) at $(date -Is)."
  exit 1
fi

RESULT="$(printf '%s\n' "${OUTPUT}" | tail -n1 | tr -d '[:space:]')"

if [ "${RESULT}" != "1|1|1" ]; then
  send_alert "OpenClaw DB probe alert on $(hostname): expected 1|1|1 but got ${RESULT}."
  exit 1
fi

exit 0
