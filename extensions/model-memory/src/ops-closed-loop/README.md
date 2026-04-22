# memory-ops-closed-loop

Observe/report-only operational instrumentation for MMV2-native model-memory.

This module is not primary memory capture and does not write semantic memory
truth. It records bounded JSONL operational signals and generates the daily
`Memory Ops Health Report`.

## No Dark Data

Signals are persisted only when they have:

- at least one automated consumer
- at least one usage-contract consumer
- a non-empty usage action
- usage consumers that are a subset of signal consumers

Signals containing secrets are rejected. Raw prompt, transcript, and tool-log
payload fields are redacted before JSONL persistence.

## Storage

- Signals: `.openclaw-memory-ops/signals/YYYY-MM-DD.jsonl`
- Recommendations: `.openclaw-memory-ops/recommendations/YYYY-MM-DD.jsonl`
- Reports: `.openclaw-memory-ops/reports/YYYY-MM-DD-memory-ops.md`
- Latest report copy: `.openclaw-memory-ops/reports/latest.md`
- Hook discovery: `.openclaw-memory-ops/hook-discovery/YYYY-MM-DDTHHMMSSZ.json`

These files are operational telemetry, not MMV2 semantic truth.

## Hook Discovery And Canary Policy

Hook discovery distinguishes static source evidence from firing evidence.

- `static_source`: source code mentions the hook, but no firing was observed.
- `synthetic_in_process`: an observe-only in-process canary registered and fired
  a handler. This proves hook mechanics, not production lifecycle firing.
- `runtime_observed`: reserved for a future safe live lifecycle trigger.

Observers must not depend on a hook that only has static source evidence.

## Wired Observe-Only Signals

The first safe wiring is limited to records the runtime already creates:

- retrieval observations from retrieval request/result records
- injection observations from selected retrieval result items plus memory status
- prompt assembly audits from context run and segment records
- conflict/supersession observations from MMV2 memory events and edges

These observers persist ids, hashes, statuses, ranks, counts, and source
pointers only. They do not persist raw prompts, transcripts, tool logs, or
duplicated memory body text.

## Auto-Fix Policy

Auto-fix is disabled for the first soak cycle. Future mechanical fixes are
listed in config but all per-fix flags are forced off in this pass.

Unsafe semantic actions remain unavailable here:

- deleting memories
- rewriting memories
- resolving semantic conflicts
- promoting quarantined memories
- changing user preferences or directives
- editing `AGENTS.md`, `USER.md`, `MEMORY.md`, or source files

## Soak Review Checklist

After one observe-only cycle, review:

- signal volume
- recommendation precision
- false positives
- hook health
- raw-data leakage checks
- report usefulness
- Daily/Weekly Operator Review surfacing

Only after soak should mechanical fixes be considered, and only behind explicit
per-fix flags.
