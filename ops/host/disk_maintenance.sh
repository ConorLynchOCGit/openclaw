#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
ARCHIVE_DIR="$WORKSPACE/archives/disk_maintenance"
DATE_ID="$(date +%F)"
OUT="$ARCHIVE_DIR/${DATE_ID}.md"
FREE_ALERT_GB=25
IMAGE_REVIEW_ALERT_GB=8
BUILDKIT_RETENTION_HOURS=168
TMP_PRE_DOCKER="$(mktemp)"
TMP_POST_DOCKER="$(mktemp)"
TMP_PRUNE="$(mktemp)"
TMP_TOP="$(mktemp)"

cleanup() {
  rm -f "$TMP_PRE_DOCKER" "$TMP_POST_DOCKER" "$TMP_PRUNE" "$TMP_TOP"
}
trap cleanup EXIT

mkdir -p "$ARCHIVE_DIR"

pre_free_bytes="$(df -B1 / | awk 'NR==2 {print $4}')"
pre_df_h="$(df -h /)"
pre_containerd="$(du -xsh /var/lib/containerd 2>/dev/null || echo 'unavailable /var/lib/containerd')"
docker system df --format '{{json .}}' > "$TMP_PRE_DOCKER"

docker builder prune --force --filter "until=${BUILDKIT_RETENTION_HOURS}h" > "$TMP_PRUNE" 2>&1

post_free_bytes="$(df -B1 / | awk 'NR==2 {print $4}')"
post_df_h="$(df -h /)"
post_containerd="$(du -xsh /var/lib/containerd 2>/dev/null || echo 'unavailable /var/lib/containerd')"
docker system df --format '{{json .}}' > "$TMP_POST_DOCKER"

if [ "$post_free_bytes" -lt $((FREE_ALERT_GB * 1024 * 1024 * 1024)) ]; then
  {
    echo "## Top Consumers"
    echo
    echo '```text'
    du -xhd1 /var/lib /root 2>/dev/null | sort -h
    echo '```'
  } > "$TMP_TOP"
fi

python3 - <<'PY' \
  "$TMP_PRE_DOCKER" \
  "$TMP_POST_DOCKER" \
  "$TMP_PRUNE" \
  "$OUT" \
  "$pre_free_bytes" \
  "$post_free_bytes" \
  "$pre_df_h" \
  "$post_df_h" \
  "$pre_containerd" \
  "$post_containerd" \
  "$TMP_TOP" \
  "$FREE_ALERT_GB" \
  "$IMAGE_REVIEW_ALERT_GB" \
  "$BUILDKIT_RETENTION_HOURS"
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

pre_docker_path = Path(sys.argv[1])
post_docker_path = Path(sys.argv[2])
prune_path = Path(sys.argv[3])
out_path = Path(sys.argv[4])
pre_free_bytes = int(sys.argv[5])
post_free_bytes = int(sys.argv[6])
pre_df_h = sys.argv[7]
post_df_h = sys.argv[8]
pre_containerd = sys.argv[9]
post_containerd = sys.argv[10]
top_path = Path(sys.argv[11])
free_alert_gb = int(sys.argv[12])
image_review_alert_gb = int(sys.argv[13])
buildkit_retention_hours = int(sys.argv[14])


def load_df_rows(path: Path):
    rows = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        rows[row["Type"]] = row
    return rows


def parse_size_to_gb(text: str) -> float:
    value = text.split(" ", 1)[0].strip()
    units = [
        ("TiB", 1024**4),
        ("GiB", 1024**3),
        ("MiB", 1024**2),
        ("KiB", 1024),
        ("TB", 1000**4),
        ("GB", 1000**3),
        ("MB", 1000**2),
        ("kB", 1000),
        ("T", 1000**4),
        ("G", 1000**3),
        ("M", 1000**2),
        ("K", 1000),
        ("B", 1),
    ]
    for suffix, multiplier in units:
        if value.endswith(suffix):
            number = float(value[: -len(suffix)] or "0")
            return number * multiplier / (1024**3)
    return 0.0


def fmt_gb_from_bytes(value: int) -> str:
    return f"{value / (1024**3):.1f}G"


pre_rows = load_df_rows(pre_docker_path)
post_rows = load_df_rows(post_docker_path)
pre_images_reclaimable = parse_size_to_gb(pre_rows["Images"]["Reclaimable"])
post_images_reclaimable = parse_size_to_gb(post_rows["Images"]["Reclaimable"])
pre_build_cache_reclaimable = parse_size_to_gb(pre_rows["Build Cache"]["Reclaimable"])
post_build_cache_reclaimable = parse_size_to_gb(post_rows["Build Cache"]["Reclaimable"])
reclaimed_free_gb = (post_free_bytes - pre_free_bytes) / (1024**3)
low_space = post_free_bytes < free_alert_gb * 1024**3
image_review = post_images_reclaimable >= image_review_alert_gb

lines = [
    "# Disk Maintenance Report",
    "",
    f"- generated_at_utc: {datetime.now(timezone.utc).isoformat()}",
    f"- free_space_alert_gb: {free_alert_gb}",
    f"- image_review_alert_gb: {image_review_alert_gb}",
    f"- buildkit_retention_hours: {buildkit_retention_hours}",
    "",
    "## Pre-Cleanup Disk State",
    "",
    "```text",
    pre_df_h,
    "```",
    f"- containerd_size: `{pre_containerd}`",
    f"- docker_images_reclaimable: `{pre_rows['Images']['Reclaimable']}`",
    f"- docker_build_cache_reclaimable: `{pre_rows['Build Cache']['Reclaimable']}`",
    "",
    "## Cleanup Action",
    "",
    "- action: `docker builder prune --force --filter until=168h`",
    "- scope: aged BuildKit cache only; no images, volumes, or running containers removed automatically",
    "",
    "```text",
    prune_path.read_text().strip() or "(no prune output)",
    "```",
    "",
    "## Post-Cleanup Disk State",
    "",
    "```text",
    post_df_h,
    "```",
    f"- containerd_size: `{post_containerd}`",
    f"- docker_images_reclaimable: `{post_rows['Images']['Reclaimable']}`",
    f"- docker_build_cache_reclaimable: `{post_rows['Build Cache']['Reclaimable']}`",
    f"- free_space_change: `{reclaimed_free_gb:+.1f}G`",
    "",
    "## Reading",
]

if reclaimed_free_gb > 0.1:
    lines.append(f"- Aged BuildKit cache cleanup reclaimed about `{reclaimed_free_gb:.1f}G` of free space in this run.")
else:
    lines.append("- No significant aged BuildKit cache was eligible for pruning in this run.")

if low_space:
    lines.append(f"- Free space is below the `{free_alert_gb}G` alert threshold; manual review is required.")
else:
    lines.append(f"- Free space is above the `{free_alert_gb}G` alert threshold.")

if image_review:
    lines.append(
        f"- Reclaimable Docker image space remains high at `{post_rows['Images']['Reclaimable']}`; manual image review is recommended."
    )
else:
    lines.append("- Reclaimable Docker image space is within the manual-review threshold.")

if top_path.exists() and top_path.stat().st_size:
    lines.extend(["", top_path.read_text().rstrip()])

out_path.write_text("\n".join(lines) + "\n")
PY

echo "disk maintenance report written: $OUT"
