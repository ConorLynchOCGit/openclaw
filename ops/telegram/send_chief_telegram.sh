#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: send_chief_telegram.sh <message>" >&2
  exit 2
fi

OPENCLAW_CONTAINER="${OPENCLAW_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E '^openclaw-runtime$|^openclaw$|openclaw.*gateway' | head -n 1)}"
MESSAGE="$1"

if [ -z "$OPENCLAW_CONTAINER" ]; then
  echo "OpenClaw gateway container not found" >&2
  exit 1
fi

docker exec \
  -e ALERT_PROMPT="Send the following alert to Conor exactly as written. Do not add any intro, commentary, or formatting beyond preserving line breaks.\n\n${MESSAGE}" \
  "$OPENCLAW_CONTAINER" \
  sh -lc 'openclaw agent --agent chief --thinking minimal --message "$ALERT_PROMPT" --deliver --reply-channel telegram --reply-to 7756506076 --json'
