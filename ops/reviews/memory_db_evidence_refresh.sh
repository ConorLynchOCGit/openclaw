#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/root/.openclaw/openclaw.json}"
DATE_ID="${1:-$(date +%F)}"
WINDOW_HOURS="${WINDOW_HOURS:-168}"
PERFORMANCE_DIR="$WORKSPACE/archives/memory_performance_reports"
SOAK_DIR="$WORKSPACE/archives/memory_soak_db_checks"
TMP_DIR="$(mktemp -d)"

source "$REPO_ROOT/ops/host/lib/postgres_client.sh"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$PERFORMANCE_DIR" "$SOAK_DIR"

eval "$(
  CONFIG_PATH="$CONFIG_PATH" node <<'NODE'
const fs = require("fs");
const { URL } = require("url");

const config = JSON.parse(fs.readFileSync(process.env.CONFIG_PATH, "utf8"));
const entries = config.plugins?.entries ?? {};
const database =
  entries["memory-middleware"]?.config?.database ?? entries["model-memory"]?.config?.database;

if (!database?.url) {
  console.error("model-memory database config missing");
  process.exit(1);
}

const url = new URL(database.url);
url.searchParams.delete("uselibpqcompat");
url.searchParams.delete("sslmode");

const shell = (value) => `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
console.log(`export MM_SCHEMA=${shell(database.schema ?? "memory_middleware")}`);
console.log(`export PGHOST=${shell(url.hostname)}`);
console.log(`export PGPORT=${shell(url.port || "5432")}`);
console.log(`export PGDATABASE=${shell(url.pathname.replace(/^\//, ""))}`);
console.log(`export PGUSER=${shell(decodeURIComponent(url.username))}`);
console.log(`export PGPASSWORD=${shell(decodeURIComponent(url.password))}`);
console.log(`export MM_STORE_HOST=${shell(url.hostname)}`);
console.log(`export MM_STORE_DATABASE=${shell(url.pathname.replace(/^\//, ""))}`);
NODE
)"

export PGSSLMODE=require
export WINDOW_START="$(
  python3 - "$WINDOW_HOURS" <<'PY'
from datetime import datetime, timedelta, timezone
import sys

hours = int(sys.argv[1])
window_start = datetime.now(timezone.utc) - timedelta(hours=hours)
print(window_start.isoformat(timespec="seconds").replace("+00:00", "Z"))
PY
)"

psql_ro() {
  local sql="$1"
  docker run --rm \
    -e PGHOST \
    -e PGPORT \
    -e PGDATABASE \
    -e PGUSER \
    -e PGPASSWORD \
    -e PGSSLMODE \
    "$OPENCLAW_POSTGRES_CLIENT_IMAGE" \
    psql -X -v ON_ERROR_STOP=1 -t -A -F $'\t' -P footer=off -c "$sql"
}

SCHEMA_FILE="$TMP_DIR/schema.tsv"
COUNTS_FILE="$TMP_DIR/counts.tsv"
WINDOW_FILE="$TMP_DIR/window.tsv"
RECENT_EVENTS_FILE="$TMP_DIR/recent_events.tsv"
RECENT_OBJECTS_FILE="$TMP_DIR/recent_objects.tsv"
REVIEWS_FILE="$TMP_DIR/reviews.tsv"

psql_ro "select tablename from pg_tables where schemaname='${MM_SCHEMA}' order by tablename;" > "$SCHEMA_FILE"

psql_ro "
select 'memory_events' as relation_name, count(*)::text, coalesce(min(happened_at)::text, ''), coalesce(max(happened_at)::text, '')
from ${MM_SCHEMA}.memory_events
union all
select 'memory_objects', count(*)::text, coalesce(min(created_at)::text, ''), coalesce(max(created_at)::text, '')
from ${MM_SCHEMA}.memory_objects
union all
select 'memory_reviews', count(*)::text, coalesce(min(created_at)::text, ''), coalesce(max(created_at)::text, '')
from ${MM_SCHEMA}.memory_reviews
union all
select 'background_jobs', count(*)::text, coalesce(min(created_at)::text, ''), coalesce(max(created_at)::text, '')
from ${MM_SCHEMA}.background_jobs;
" > "$COUNTS_FILE"

psql_ro "
select 'candidate_events_window', count(*)::text, coalesce(min(happened_at)::text, ''), coalesce(max(happened_at)::text, '')
from ${MM_SCHEMA}.memory_events
where event_kind = 'candidate_submission' and happened_at >= '${WINDOW_START}'::timestamptz
union all
select 'candidate_objects_window', count(*)::text, coalesce(min(created_at)::text, ''), coalesce(max(created_at)::text, '')
from ${MM_SCHEMA}.memory_objects
where review_state = 'candidate' and created_at >= '${WINDOW_START}'::timestamptz
union all
select 'approved_objects_window', count(*)::text, coalesce(min(created_at)::text, ''), coalesce(max(created_at)::text, '')
from ${MM_SCHEMA}.memory_objects
where review_state = 'approved' and created_at >= '${WINDOW_START}'::timestamptz
union all
select 'approval_reviews_window', count(*)::text, coalesce(min(created_at)::text, ''), coalesce(max(created_at)::text, '')
from ${MM_SCHEMA}.memory_reviews
where action = 'approve' and created_at >= '${WINDOW_START}'::timestamptz;
" > "$WINDOW_FILE"

psql_ro "
select id::text, event_kind::text, happened_at::text, coalesce(session_id::text, '')
from ${MM_SCHEMA}.memory_events
order by happened_at desc
limit 10;
" > "$RECENT_EVENTS_FILE"

psql_ro "
select id::text, memory_kind::text, review_state::text, created_at::text, coalesce(session_id::text, '')
from ${MM_SCHEMA}.memory_objects
order by created_at desc
limit 10;
" > "$RECENT_OBJECTS_FILE"

psql_ro "
select id::text, action::text, resulting_state::text, created_at::text, memory_object_id::text
from ${MM_SCHEMA}.memory_reviews
order by created_at desc
limit 10;
" > "$REVIEWS_FILE"

WORKSPACE="$WORKSPACE" \
DATE_ID="$DATE_ID" \
WINDOW_HOURS="$WINDOW_HOURS" \
WINDOW_START="$WINDOW_START" \
PERFORMANCE_OUT="$PERFORMANCE_DIR/${DATE_ID}.md" \
SOAK_OUT="$SOAK_DIR/${DATE_ID}.md" \
SCHEMA_FILE="$SCHEMA_FILE" \
COUNTS_FILE="$COUNTS_FILE" \
WINDOW_FILE="$WINDOW_FILE" \
RECENT_EVENTS_FILE="$RECENT_EVENTS_FILE" \
RECENT_OBJECTS_FILE="$RECENT_OBJECTS_FILE" \
REVIEWS_FILE="$REVIEWS_FILE" \
MM_SCHEMA="$MM_SCHEMA" \
MM_STORE_HOST="$MM_STORE_HOST" \
MM_STORE_DATABASE="$MM_STORE_DATABASE" \
OPENCLAW_POSTGRES_CLIENT_IMAGE="$OPENCLAW_POSTGRES_CLIENT_IMAGE" \
python3 - <<'PY'
import csv
import os
from datetime import datetime, timezone
from pathlib import Path

date_id = os.environ["DATE_ID"]
generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
schema = os.environ["MM_SCHEMA"]
store_host = os.environ["MM_STORE_HOST"]
store_database = os.environ["MM_STORE_DATABASE"]
client_image = os.environ["OPENCLAW_POSTGRES_CLIENT_IMAGE"]

def read_rows(path_env: str):
    text = Path(os.environ[path_env]).read_text().strip()
    if not text:
        return []
    return list(csv.reader(text.splitlines(), delimiter="\t"))

def table(headers, rows):
    lines = [
        "| " + " | ".join(headers) + " |",
        "|" + "|".join(["---"] * len(headers)) + "|",
    ]
    if not rows:
        lines.append("| " + " | ".join(["none"] * len(headers)) + " |")
        return lines
    for row in rows:
        padded = list(row) + [""] * (len(headers) - len(row))
        lines.append("| " + " | ".join(f"`{cell}`" if cell else "" for cell in padded[: len(headers)]) + " |")
    return lines

schema_rows = read_rows("SCHEMA_FILE")
count_rows = read_rows("COUNTS_FILE")
window_rows = read_rows("WINDOW_FILE")
event_rows = read_rows("RECENT_EVENTS_FILE")
object_rows = read_rows("RECENT_OBJECTS_FILE")
review_rows = read_rows("REVIEWS_FILE")

performance_lines = [
    f"# Memory Performance Report — {date_id}",
    "",
    f"Generated at: {generated_at}",
    f"Window: last {os.environ['WINDOW_HOURS']} hours (since `{os.environ['WINDOW_START']}`)",
    "Scope: bounded operator observability for model-memory event, object, and review freshness.",
    "",
    "## Canonical Store",
    "",
    "- store_type: model-memory Postgres",
    f"- store_host: `{store_host}`",
    f"- store_database: `{store_database}`",
    f"- store_schema: `{schema}`",
    "",
    "## Window Summary",
    "",
    *table(["Metric", "Count", "Oldest Timestamp", "Newest Timestamp"], window_rows),
    "",
    "## Recent Memory Events",
    "",
    *table(["ID", "Kind", "Timestamp", "Session"], event_rows),
    "",
    "## Recent Memory Objects",
    "",
    *table(["ID", "Kind", "Review State", "Created At", "Session"], object_rows),
    "",
]

soak_lines = [
    f"# Memory Soak DB Check — {date_id}",
    "",
    f"Generated at: {generated_at}",
    "Scope: read-only proof of the model-memory database relations used for operator evidence.",
    f"Source inputs: `/root/.openclaw/openclaw.json` model-memory database config, read-only `psql` via `{client_image}`, and the live configured schema.",
    "",
    "## Canonical Store",
    "",
    "- store_type: model-memory Postgres",
    f"- store_host: `{store_host}`",
    f"- store_database: `{store_database}`",
    f"- store_schema: `{schema}`",
    "",
    "## Relevant Relations",
    "",
    *[f"- `{row[0]}`" for row in schema_rows if row],
    "",
    "## Count Snapshot",
    "",
    *table(["Relation", "Rows", "Oldest Timestamp", "Newest Timestamp"], count_rows),
    "",
    "## Recent Reviews",
    "",
    *table(["ID", "Action", "Resulting State", "Created At", "Memory Object"], review_rows),
    "",
]

Path(os.environ["PERFORMANCE_OUT"]).write_text("\n".join(performance_lines), "utf8")
Path(os.environ["SOAK_OUT"]).write_text("\n".join(soak_lines), "utf8")
PY

chown ubuntu:ubuntu "$PERFORMANCE_DIR/${DATE_ID}.md" "$SOAK_DIR/${DATE_ID}.md"
printf 'memory db evidence refreshed: %s %s\n' "$PERFORMANCE_DIR/${DATE_ID}.md" "$SOAK_DIR/${DATE_ID}.md"
