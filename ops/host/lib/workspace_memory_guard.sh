#!/usr/bin/env bash

workspace_memory_writeability_guard_note() {
  local workspace="${1:-/root/.openclaw/workspace}"

  python3 - "$workspace" <<'PY'
import os
import stat
import sys
from pathlib import Path

workspace = Path(sys.argv[1]).resolve()
runtime_uid = int(os.environ.get("OPENCLAW_RUNTIME_UID", "1000"))
runtime_gid = int(os.environ.get("OPENCLAW_RUNTIME_GID", "1000"))
max_paths = int(os.environ.get("OPENCLAW_MEMORY_GUARD_MAX_PATHS", "20"))

candidates = [
    workspace / "MEMORY.md",
    workspace / "SOUL.md",
    workspace / "USER.md",
    workspace / "HEARTBEAT.md",
]
memory_dir = workspace / "memory"
if memory_dir.exists():
    candidates.extend(sorted(memory_dir.glob("*.md")))

checked = []
problems = []

for path in candidates:
    if not path.exists():
        continue
    try:
        st = path.stat()
    except OSError as exc:
        problems.append((str(path), "stat_failed", str(exc), None, None, None))
        continue
    mode = stat.S_IMODE(st.st_mode)
    writable = (
        (st.st_uid == runtime_uid and bool(mode & stat.S_IWUSR))
        or (st.st_gid == runtime_gid and bool(mode & stat.S_IWGRP))
        or bool(mode & stat.S_IWOTH)
    )
    checked.append(path)
    if not writable:
        problems.append((
            str(path),
            "runtime_user_not_writeable",
            f"uid={st.st_uid} gid={st.st_gid} mode={mode:04o}",
            st.st_uid,
            st.st_gid,
            mode,
        ))

print(f"workspace: {workspace}")
print(f"expected_runtime_uid: {runtime_uid}")
print(f"expected_runtime_gid: {runtime_gid}")
print(f"checked_files: {len(checked)}")
print(f"problem_count: {len(problems)}")

if not problems:
    print("status: ok")
    print("note: checked workspace memory/startup files are writeable by the runtime uid/gid model.")
    raise SystemExit(0)

print("status: warning")
print("note: one or more workspace memory/startup files may fail scheduled agent startup or memory-maintenance append-open checks.")
print("problem_paths:")
for path, reason, detail, *_ in problems[:max_paths]:
    print(f"  - {path} ({reason}; {detail})")
if len(problems) > max_paths:
    print(f"  - ... {len(problems) - max_paths} additional paths omitted")

problem_paths = [path for path, *_ in problems]
if len(problem_paths) <= 8:
    joined = " ".join(f"'{path}'" for path in problem_paths)
    print(f"recommended_repair_command: sudo chown ubuntu:ubuntu {joined}")
else:
    print(
        "recommended_repair_command: "
        "sudo chown ubuntu:ubuntu "
        f"'{workspace / 'MEMORY.md'}' '{workspace / 'SOUL.md'}' "
        f"'{workspace / 'USER.md'}' '{workspace / 'HEARTBEAT.md'}' "
        f"'{workspace / 'memory'}'/*.md"
    )
print("mutation: none")
PY
}
