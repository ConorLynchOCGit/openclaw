#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${OPENCLAW_GATEWAY_CONTAINER:-openclaw-runtime}"

env_file_value() {
  local name="$1"
  local file="$2"
  awk -F= -v key="$name" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
    }
    END {
      if (value != "") {
        print value
      }
    }
  ' "$file" 2>/dev/null | sed -e 's/^"//' -e 's/"$//'
}

repo_env="$ROOT_DIR/.env"
config_dir="${OPENCLAW_CONFIG_DIR:-}"
if [[ -z "$config_dir" && -f "$repo_env" ]]; then
  config_dir="$(env_file_value OPENCLAW_CONFIG_DIR "$repo_env")"
fi
config_dir="${config_dir:-$ROOT_DIR/.openclaw/runtime}"

runtime_home_host="${OPENCLAW_RUNTIME_HOME_HOST:-$config_dir/runtime}"
codex_home_host="${OPENCLAW_CODEX_HOME_HOST:-$runtime_home_host/providers/codex}"
codex_import_dir="${OPENCLAW_CODEX_IMPORT_DIR:-/root/.codex}"

runtime_uid="${OPENCLAW_RUNTIME_UID:-1000}"
runtime_gid="${OPENCLAW_RUNTIME_GID:-1000}"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  runtime_uid="$(docker exec "$CONTAINER" sh -lc 'id -u' 2>/dev/null | tail -n 1 || printf '%s' "$runtime_uid")"
  runtime_gid="$(docker exec "$CONTAINER" sh -lc 'id -g' 2>/dev/null | tail -n 1 || printf '%s' "$runtime_gid")"
fi

mkdir -p \
  "$runtime_home_host/providers" \
  "$runtime_home_host/state" \
  "$runtime_home_host/config" \
  "$runtime_home_host/cache" \
  "$runtime_home_host/tmp" \
  "$codex_home_host"

chmod 700 "$runtime_home_host" "$runtime_home_host/providers" "$runtime_home_host/state" \
  "$runtime_home_host/config" "$runtime_home_host/cache" "$runtime_home_host/tmp" "$codex_home_host"

imported=()
if [[ -d "$codex_import_dir" ]]; then
  for name in \
    auth.json \
    config.toml \
    installation_id \
    models_cache.json \
    version.json \
    state_5.sqlite \
    state_5.sqlite-shm \
    state_5.sqlite-wal
  do
    if [[ -f "$codex_import_dir/$name" && ! -e "$codex_home_host/$name" ]]; then
      cp "$codex_import_dir/$name" "$codex_home_host/$name"
      imported+=("$name")
    fi
  done
fi

chown -R "$runtime_uid:$runtime_gid" "$runtime_home_host/providers" "$runtime_home_host/state" \
  "$runtime_home_host/config" "$runtime_home_host/cache" "$runtime_home_host/tmp"
find "$runtime_home_host/providers" -type d -exec chmod 700 {} +
find "$runtime_home_host/providers" -type f -exec chmod 600 {} +

node - <<'NODE' "$runtime_home_host" "$codex_home_host" "$runtime_uid" "$runtime_gid" "${imported[@]}"
const [runtimeHomeHost, codexHomeHost, runtimeUid, runtimeGid, ...imported] = process.argv.slice(2);
console.log(JSON.stringify({
  artifactKind: "openclaw.runtime_home_reconciliation",
  status: "succeeded",
  runtimeHomeHost,
  providerHomes: {
    codex: codexHomeHost,
  },
  runtimeUid,
  runtimeGid,
  importedCodexStateFiles: imported,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  secretsStored: false,
}, null, 2));
NODE
