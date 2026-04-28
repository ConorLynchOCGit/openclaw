#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
DATE_ID="${1:-${DATE_ID:-$(date +%F)}}"
REPORT_DIR="${OPENCLAW_DAILY_CONTINUITY_REPORT_DIR:-$WORKSPACE/archives/daily_memory_continuity}"
MEMORY_DIR="$WORKSPACE/memory"
CANONICAL_NOTE="$MEMORY_DIR/${DATE_ID}.md"

mkdir -p "$MEMORY_DIR" "$REPORT_DIR"

DATE_ID="$DATE_ID" \
WORKSPACE="$WORKSPACE" \
MEMORY_DIR="$MEMORY_DIR" \
CANONICAL_NOTE="$CANONICAL_NOTE" \
REPORT_DIR="$REPORT_DIR" \
python3 - <<'PY'
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path

date_id = os.environ["DATE_ID"]
workspace = Path(os.environ["WORKSPACE"])
memory_dir = Path(os.environ["MEMORY_DIR"])
canonical_note = Path(os.environ["CANONICAL_NOTE"])
report_dir = Path(os.environ["REPORT_DIR"])
marker = f"<!-- openclaw:daily-continuity-finalizer:{date_id} -->"

if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_id):
    raise SystemExit(f"invalid DATE_ID: {date_id}")


def rel(path: Path) -> str:
    try:
        return path.relative_to(workspace).as_posix()
    except ValueError:
        return path.as_posix()


def read_lines(path: Path, limit: int = 200) -> list[str]:
    try:
        return path.read_text(errors="replace").splitlines()[:limit]
    except FileNotFoundError:
        return []


def clean_line(value: str) -> str:
    value = value.strip()
    value = re.sub(r"\s+", " ", value)
    return value[:220]


def safe_summary_lines(path: Path, kind: str) -> list[str]:
    lines = read_lines(path)
    out: list[str] = []
    if kind == "leaf_note":
        for line in lines:
            text = clean_line(line)
            if (
                text.startswith("# ")
                or text.startswith("- **Session Key**:")
                or text.startswith("- **Session ID**:")
                or text.startswith("- **Source**:")
                or text.startswith("- **Session Leaf**:")
            ):
                out.append(text)
            if len(out) >= 8:
                break
    elif kind == "daily_operator_review":
        for line in lines:
            text = clean_line(line)
            if re.search(r"\bfalls back\b|\bfallback\b|latest available DB-backed", text, re.IGNORECASE):
                continue
            if text.startswith("#") or text.startswith("- Daily memory") or text.startswith("- Memory Ops"):
                out.append(text)
            if len(out) >= 12:
                break
    elif kind == "daily_memory_evidence":
        capture = False
        in_matching_notes = False
        for line in lines:
            text = clean_line(line)
            if text == "## Coverage Status":
                capture = True
                out.append(text)
                continue
            if text == "## Matching Raw Notes":
                in_matching_notes = True
                out.append(text)
                continue
            if text.startswith("## ") and text not in {"## Coverage Status", "## Matching Raw Notes"}:
                if capture or in_matching_notes:
                    break
                continue
            if re.search(r"archives/memory_(?:performance_reports|soak_db_checks)/", text) and f"/{date_id}.md" not in text:
                continue
            if re.search(r"latest available|artifact missing; using", text, re.IGNORECASE):
                continue
            if capture and text.startswith("- "):
                out.append(text)
            elif in_matching_notes and text.startswith("- "):
                out.append(text)
            if len(out) >= 12:
                break
    elif kind in {"memory_performance_report", "memory_soak_db_check", "cron_report"}:
        for line in lines:
            text = clean_line(line)
            if (
                text.startswith("# ")
                or text.startswith("Generated at:")
                or text.startswith("Scope:")
                or text.startswith("Window:")
                or text.startswith("- store_type:")
                or text.startswith("- store_schema:")
            ):
                out.append(text)
            if len(out) >= 14:
                break
    return out or ["bounded summary unavailable; evidence path recorded only"]


def evidence_entry(path: Path, kind: str) -> dict[str, object]:
    return {
        "kind": kind,
        "path": path,
        "summary": safe_summary_lines(path, kind),
    }


leaf_notes = sorted(
    path
    for path in memory_dir.glob(f"{date_id}-*.md")
    if path.is_file() and path.name != f"{date_id}.md"
)

candidate_artifacts: list[tuple[str, Path]] = [
    ("daily_operator_review", workspace / "archives/daily_operator_reviews" / f"{date_id}.md"),
    ("daily_memory_evidence", workspace / "archives/daily_memory_evidence" / f"{date_id}.md"),
    ("memory_performance_report", workspace / "archives/memory_performance_reports" / f"{date_id}.md"),
    ("memory_soak_db_check", workspace / "archives/memory_soak_db_checks" / f"{date_id}.md"),
    ("cron_report", workspace / "archives/cron_health_rollups" / f"{date_id}.md"),
    ("cron_report", workspace / "archives/cron_session_hygiene" / f"{date_id}.md"),
]

evidence: list[dict[str, object]] = [
    evidence_entry(path, "leaf_note") for path in leaf_notes
]
evidence.extend(
    evidence_entry(path, kind)
    for kind, path in candidate_artifacts
    if path.is_file() and path.stat().st_size > 0
)

generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
report_path = report_dir / f"{date_id}.md"
report_lines = [
    f"# Daily Memory Continuity Finalizer — {date_id}",
    "",
    f"- generated_at_utc: {generated_at}",
    f"- canonical_daily_note: `{rel(canonical_note)}`",
]

if canonical_note.exists():
    status = "canonical_exists_finalizer_block_present" if marker in canonical_note.read_text(errors="replace") else "canonical_exists_preserved"
    report_lines.extend(
        [
            f"- status: `{status}`",
            "- action: `skipped_existing_canonical_note`",
            "",
            "Existing canonical daily memory was preserved unchanged.",
        ]
    )
else:
    if not evidence:
        status = "skipped_no_exact_same_day_evidence"
        report_lines.extend(
            [
                f"- status: `{status}`",
                "- action: `skipped`",
                "",
                "No exact same-day durable evidence was found. The finalizer did not create a canonical daily note.",
            ]
        )
    else:
        status = "created_from_exact_same_day_evidence"
        note_lines = [
            f"# {date_id}",
            "",
            marker,
            "",
            "## Daily Continuity Finalizer",
            "",
            f"- generated_at_utc: {generated_at}",
            "- producer: `daily_memory_continuity_finalizer`",
            "- status: `backfilled_from_exact_same_day_evidence`",
            "- authority: `continuity_input_only_not_semantic_truth`",
            "- raw_content_policy: `bounded_metadata_and_summaries_only`",
            "",
            "## Evidence Used",
            "",
        ]
        for item in evidence:
            note_lines.append(f"- `{rel(item['path'])}` ({item['kind']})")
        note_lines.extend(["", "## Bounded Evidence Snapshot", ""])
        for item in evidence:
            note_lines.append(f"### {rel(item['path'])}")
            note_lines.append("")
            for summary_line in item["summary"]:
                note_lines.append(f"- {summary_line}")
            note_lines.append("")
        note_lines.extend(
            [
                "## Guardrails",
                "",
                "- This note exists because the canonical daily memory file was missing.",
                "- It uses exact same-day durable evidence only.",
                "- It does not use older DB artifacts, stale weekly summaries, raw transcripts, raw prompts, raw tool logs, secrets, or private phrases.",
                "- It is a continuity and ingestion surface, not semantic truth authority.",
                "",
            ]
        )
        canonical_note.write_text("\n".join(note_lines), encoding="utf-8")
        report_lines.extend(
            [
                f"- status: `{status}`",
                "- action: `created_canonical_daily_note`",
                f"- evidence_count: `{len(evidence)}`",
                "",
                "## Evidence Used",
                "",
            ]
        )
        for item in evidence:
            report_lines.append(f"- `{rel(item['path'])}` ({item['kind']})")

report_lines.extend(
    [
        "",
        "## Guardrails",
        "",
        "- exact same-day durable evidence only",
        "- canonical daily notes are lower-authority continuity inputs",
        "- no raw prompts, full transcripts, raw tool logs, secrets, or private phrases are copied",
    ]
)
report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
print(f"daily continuity finalizer status: {status}")
print(f"daily continuity finalizer report: {report_path}")
PY

if [[ -e "$CANONICAL_NOTE" ]]; then
  chown ubuntu:ubuntu "$CANONICAL_NOTE" 2>/dev/null || true
fi
chown ubuntu:ubuntu "$REPORT_DIR" "$REPORT_DIR/${DATE_ID}.md" 2>/dev/null || true
