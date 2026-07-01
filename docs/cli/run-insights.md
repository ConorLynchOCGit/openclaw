---
summary: "CLI reference for `openclaw run-insights` (compact run performance readback)"
read_when:
  - You want to understand why current or recent agent work feels slow
  - You need bounded performance evidence without reading raw transcripts
title: "`openclaw run-insights`"
---

`openclaw run-insights` summarizes recent run, session, child-task, and task
delivery performance evidence from native readback surfaces.

It is an operator-facing projection. It is not lifecycle truth, a proof runner,
a quality gate, or a replacement for transcripts, tasks, artifacts, or GBrain
memory.
When evidence is absent or unreadable, the report should say `unknown` and
point to the missing evidence rather than infer state.

## Usage

```bash
openclaw run-insights
openclaw run-insights --agent coding
openclaw run-insights --session agent:coding:main
openclaw run-insights --task <task-id>
openclaw run-insights --active 120
openclaw run-insights --limit 5
openclaw run-insights --json
```

## Options

- `--json`: output machine-readable JSON.
- `--agent <id>`: focus recent session readback on one agent.
- `--session <key>`: focus readback on one session key or session id. Task
  readback is limited to tasks whose requester, owner, or child session key
  matches.
- `--task <id>`: focus task readback on one task id.
- `--active <minutes>`: only consider sessions updated within the past N minutes.
- `--limit <count>`: maximum sessions to show. The command caps this at 50.

## What It Reads

The command uses the same bounded status/session/task summaries that power
`openclaw status`, `openclaw sessions`, and `openclaw tasks`.

It displays:

- recent sessions, token/context pressure, and session pointers;
- cached session cost/usage, message count, tool-call count, and top tools when
  the native usage cache is fresh;
- V3 performance profile sections that explain expensive runs, child/session
  evidence, bounded timeline entries, retry/build/proof cost, validation/build
  bottleneck indicators, and advisory inefficiency flags;
- recent task records, status, delivery status, age, elapsed time, labels, and
  latest task event summaries;
- child task pointers when native task records expose child sessions;
- task delivery friction such as failed, parent-missing, or queued-session
  delivery states.
- recent deploy/build/smoke/gate/promote receipt events from the native
  runtime-visible deploy journal, including image digest, source commit, build
  profile, and artifact pointers when present.

It does not crawl raw transcripts or refresh usage caches. It emits pointers to
deeper surfaces when follow-up inspection is needed.

## Control UI Workbench

The Control UI exposes the same report at `/run-insights` as an operator
workbench. It is meant for scanning current run friction before deciding which
native surface to inspect next.

The workbench panels mirror bounded report fields:

- summary metrics for sessions, tasks, attention, and deploy activity;
- performance and cost profile for cached usage, token, tool, error, and
  promoted-image evidence;
- attention readback for slow-work, validation, and promotion signals;
- timeline and phase readback from existing timeline entries only;
- child and task evidence from native task rows, child-session pointers,
  progress summaries, and delivery state;
- validation, build, and promote cost from deploy receipts, known durations,
  bottlenecks, failed counts, and artifact summaries;
- pointers and debug fallback for task/session/deploy/audit commands, proof or
  artifact paths, and the raw bounded JSON report.

The workbench preserves the same authority boundary as the CLI: advisory
signals explain where to look, evidence rows and pointers name what was read,
and runtime truth remains in native sessions, tasks, deploy receipts,
transcripts, and bounded artifacts. Missing evidence should render as
`unknown` or an empty bounded panel, not as inferred lifecycle state.

## Signals

The command surfaces advisory signals such as:

- active tasks;
- active child tasks;
- task failures;
- task delivery issues;
- sessions that report an aborted last run;
- high context pressure;
- tool-heavy sessions;
- cached usage/parsing errors;
- long-active tasks with no recent task-event movement;
- stale token estimates.
- recent deploy receipt failures.

Signals are evidence for review. They do not deterministically fail or pass a
run.

The performance profile is also advisory. It summarizes evidence already
available from sessions, task records, usage caches, and deploy receipts; it
does not execute proof, retry work, promote builds, or decide finality.

## Related

- [CLI reference](/cli)
- [Status](/cli/status)
- [Sessions](/cli/sessions)
- [Tasks](/cli/tasks)
