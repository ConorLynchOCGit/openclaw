#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATE_ID="${1:-$(date +%F)}"
ARCHIVE_DIR="$WORKSPACE/archives/daily_memory_evidence"
MEMORY_DIR="$WORKSPACE/memory"
PERFORMANCE_DIR="$WORKSPACE/archives/memory_performance_reports"
SOAK_DIR="$WORKSPACE/archives/memory_soak_db_checks"
OUT="$ARCHIVE_DIR/${DATE_ID}.md"
DB_REFRESH_SCRIPT="$REPO_ROOT/ops/reviews/memory_db_evidence_refresh.sh"

mkdir -p "$ARCHIVE_DIR"

if [[ ( ! -s "$PERFORMANCE_DIR/${DATE_ID}.md" || ! -s "$SOAK_DIR/${DATE_ID}.md" ) && -x "$DB_REFRESH_SCRIPT" ]]; then
  "$DB_REFRESH_SCRIPT" "$DATE_ID" >/dev/null 2>&1 || true
fi

DATE_ID="$DATE_ID" \
WORKSPACE="$WORKSPACE" \
MEMORY_DIR="$MEMORY_DIR" \
PERFORMANCE_DIR="$PERFORMANCE_DIR" \
SOAK_DIR="$SOAK_DIR" \
OUT="$OUT" \
python3 - <<'PY'
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

date_id = os.environ["DATE_ID"]
workspace = Path(os.environ["WORKSPACE"])
memory_dir = Path(os.environ["MEMORY_DIR"])
performance_dir = Path(os.environ["PERFORMANCE_DIR"])
soak_dir = Path(os.environ["SOAK_DIR"])
out = Path(os.environ["OUT"])


def rel(path: Path | None) -> str:
    if path is None:
        return "none"
    return path.relative_to(workspace).as_posix()


def excerpt(path: Path | None, limit: int = 24) -> list[str]:
    if path is None or not path.exists():
        return ["missing"]
    lines = []
    for raw in path.read_text(errors="replace").splitlines():
        text = raw.rstrip()
        if not text:
            continue
        lines.append(text)
        if len(lines) >= limit:
            break
    return lines or ["empty"]


def match_memory_notes() -> list[Path]:
    exact = memory_dir / f"{date_id}.md"
    matches = sorted(p for p in memory_dir.glob(f"{date_id}*.md") if p.is_file())
    if exact.exists() and exact not in matches:
        matches.insert(0, exact)
    return matches


def latest_artifact(artifact_dir: Path) -> Path | None:
    exact = artifact_dir / f"{date_id}.md"
    if exact.exists():
        return exact
    prior = sorted(
        p for p in artifact_dir.glob("*.md") if p.is_file() and p.stem <= date_id
    )
    return prior[-1] if prior else None


memory_notes = match_memory_notes()
exact_daily = memory_dir / f"{date_id}.md"
performance = latest_artifact(performance_dir)
soak = latest_artifact(soak_dir)

lines = [
    f"# Daily Memory Evidence — {date_id}",
    "",
    f"Generated at: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
    "",
    "## Truth Hierarchy",
    "",
    "1. Date-prefixed raw notes under `memory/`",
    "2. Exact canonical daily note `memory/YYYY-MM-DD.md` when it exists",
    "3. DB-backed memory performance artifact under `archives/memory_performance_reports/`",
    "4. DB-backed memory soak artifact under `archives/memory_soak_db_checks/`",
    "",
    "## Coverage Status",
    "",
    f"- date_id: `{date_id}`",
    f"- exact_daily_note: `{rel(exact_daily) if exact_daily.exists() else 'missing'}`",
    f"- matching_date_prefixed_notes: `{len(memory_notes)}`",
    f"- memory_performance_artifact: `{rel(performance)}`",
    f"- memory_soak_artifact: `{rel(soak)}`",
    "",
    "## Matching Raw Notes",
    "",
]

if memory_notes:
    for note in memory_notes:
        lines.append(f"- `{rel(note)}`")
else:
    lines.append("- none")

lines.extend(["", "## Raw Note Excerpts", ""])
if memory_notes:
    for note in memory_notes[:6]:
        lines.append(f"### {rel(note)}")
        lines.append("```")
        lines.extend(excerpt(note))
        lines.append("```")
        lines.append("")
else:
    lines.extend(["No date-prefixed raw notes found.", ""])

lines.extend(["## DB-Backed Memory Artifacts", ""])
for title, artifact in (
    ("Memory Performance Report", performance),
    ("Memory Soak DB Check", soak),
):
    lines.append(f"### {title}")
    lines.append(f"- selected_artifact: `{rel(artifact)}`")
    if artifact is not None and artifact.stem != date_id:
        lines.append(
            f"- freshness_note: exact `{date_id}` artifact missing; using latest available `{artifact.stem}`"
        )
    elif artifact is None:
        lines.append(f"- freshness_note: no artifact available on or before `{date_id}`")
    else:
        lines.append(f"- freshness_note: exact `{date_id}` artifact present")
    lines.append("```")
    lines.extend(excerpt(artifact))
    lines.append("```")
    lines.append("")

lines.extend(
    [
        "## Operator Guidance",
        "",
        "- Daily and weekly operator reviews should ground memory claims in this artifact instead of assuming `memory/YYYY-MM-DD.md` exists.",
        "- If exact daily notes are missing, treat the date-prefixed note set plus the latest DB-backed artifacts as the durable evidence layer.",
        "- Do not infer missing canonical daily records when same-day or prior-day evidence is explicitly listed here.",
        "",
    ]
)

out.write_text("\n".join(lines))
PY

chown ubuntu:ubuntu "$OUT"
printf 'daily memory evidence written: %s\n' "$OUT"
