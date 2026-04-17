#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
WEEK_ID="$(date +%G-W%V)"
ARTIFACT="$WORKSPACE/archives/weekly_operator_reviews/${WEEK_ID}.md"
OUT="$WORKSPACE/projects/ops/generated_current/weekly_review_telegram_summary_current.txt"
SEND_HELPER="$REPO_ROOT/ops/telegram/send_chief_telegram.sh"
PREVIEW_ONLY=0

if [ "${1:-}" = "--preview-only" ]; then
  PREVIEW_ONLY=1
elif [ $# -gt 0 ]; then
  echo "usage: $0 [--preview-only]" >&2
  exit 2
fi

if [ ! -f "$ARTIFACT" ] || [ ! -s "$ARTIFACT" ]; then
  echo "missing or empty weekly artifact: $ARTIFACT" >&2
  exit 1
fi

ARTIFACT="$ARTIFACT" WEEK_ID="$WEEK_ID" OUT="$OUT" python3 - <<'PY'
import os
from pathlib import Path

artifact_path = Path(os.environ["ARTIFACT"])
week_id = os.environ["WEEK_ID"]
out_path = Path(os.environ["OUT"])
text = artifact_path.read_text()
lines = text.splitlines()

def clean_text(text: str) -> str:
    return text.replace("`", "").strip()

def top_level_section_body(title: str) -> list[str]:
    start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith("## "):
            continue
        heading = stripped[3:].strip()
        if heading == title or heading.endswith(f". {title}"):
            start = i + 1
            break
    if start is None:
        return []
    body = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        body.append(line.rstrip())
    return body

def third_level_section_body(title: str) -> list[str]:
    start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == f"### {title}":
            start = i + 1
            break
    if start is None:
        return []
    out = []
    for line in lines[start:]:
        if line.startswith("### ") or line.startswith("## "):
            break
        out.append(line.rstrip())
    return out

def bullet_lines(body: list[str], limit: int, skip_prefixes: tuple[str, ...] = ()) -> list[str]:
    out = []
    for line in body:
        stripped = line.strip()
        if not stripped.startswith("- "):
            continue
        item = clean_text(stripped[2:])
        if not item:
            continue
        lowered = item.lower()
        if any(lowered.startswith(prefix) for prefix in skip_prefixes):
            continue
        out.append(item)
        if len(out) >= limit:
            break
    return out

def compact_lines(body: list[str], limit: int, skip_prefixes: tuple[str, ...] = ()) -> list[str]:
    out = []
    for line in body:
        stripped = clean_text(line)
        if not stripped or stripped == "---":
            continue
        lowered = stripped.lower()
        if any(lowered.startswith(prefix) for prefix in skip_prefixes):
            continue
        if stripped.startswith("- "):
            stripped = clean_text(stripped[2:])
        out.append(stripped)
        if len(out) >= limit:
            break
    return out

def first_meaningful_line(body: list[str], skip_prefixes: tuple[str, ...] = ()) -> str:
    for line in body:
        stripped = clean_text(line)
        if not stripped or stripped == "---":
            continue
        if stripped.startswith("#"):
            continue
        lowered = stripped.lower()
        if any(lowered.startswith(prefix) for prefix in skip_prefixes):
            continue
        if stripped.startswith("- "):
            stripped = clean_text(stripped[2:])
        return stripped
    return ""

top_findings = bullet_lines(third_level_section_body("Executive Summary"), 3)
if not top_findings:
    top_findings = bullet_lines(top_level_section_body("Executive Summary"), 3)
immediate_action = compact_lines(
    top_level_section_body("Recommended Immediate Action"),
    2,
    ("reasons:", "phase 10.6 follow-on hardening, specifically:"),
)
if not immediate_action:
    immediate_action = bullet_lines(top_level_section_body("Recommended Immediate Action"), 2)

net_new_build_name = first_meaningful_line(
    top_level_section_body("Recommended Net-New Build"),
    (
        "why this qualifies as net-new",
        "what it would do",
        "why it is credible now",
        "if that is considered premature",
        "no net-new build recommendation",
    ),
)
net_new_build = [net_new_build_name] if net_new_build_name else []
if not net_new_build:
    net_new_build = compact_lines(
        top_level_section_body("Recommended Net-New Build"),
        1,
        (
            "why this qualifies as net-new",
            "what it would do",
            "why it is credible now",
            "if that is considered premature",
            "no net-new build recommendation",
        ),
    )

message_lines = [f"Weekly Operator Review {week_id}"]
message_lines.append("")
message_lines.append("Top findings:")
for item in top_findings[:3]:
    message_lines.append(f"- {item}")

if immediate_action:
    message_lines.append("")
    message_lines.append("Recommended immediate action:")
    for item in immediate_action[:2]:
        message_lines.append(f"- {item}")

if net_new_build:
    message_lines.append("")
    message_lines.append("Recommended net-new build:")
    for item in net_new_build[:1]:
        message_lines.append(f"- {item}")

summary = "\n".join(message_lines).strip() + "\n"
out_path.write_text(summary)
print(summary, end="")
PY

if [ "$PREVIEW_ONLY" -eq 1 ]; then
  echo "preview-only: summary generated at $OUT"
  exit 0
fi

"$SEND_HELPER" "$(cat "$OUT")"
