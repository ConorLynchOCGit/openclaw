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

## Usage

```bash
openclaw run-insights
openclaw run-insights --agent coding
openclaw run-insights --active 120
openclaw run-insights --limit 5
openclaw run-insights --json
```

## Options

- `--json`: output machine-readable JSON.
- `--agent <id>`: focus recent session readback on one agent.
- `--active <minutes>`: only consider sessions updated within the past N minutes.
- `--limit <count>`: maximum sessions to show. The command caps this at 50.

## What It Reads

The command uses the same bounded status/session/task summaries that power
`openclaw status`, `openclaw sessions`, and `openclaw tasks`.

It displays:

- recent sessions, token/context pressure, and session pointers;
- recent task records, status, delivery status, age, elapsed time, labels, and
  latest task event summaries;
- child task pointers when native task records expose child sessions;
- task delivery friction such as failed, parent-missing, or queued-session
  delivery states.

It does not crawl raw transcripts by default. It emits pointers to deeper
surfaces when follow-up inspection is needed.

## Signals

The command surfaces advisory signals such as:

- active tasks;
- active child tasks;
- task failures;
- task delivery issues;
- sessions that report an aborted last run;
- high context pressure;
- long-active tasks with no recent task-event movement;
- stale token estimates.

Signals are evidence for review. They do not deterministically fail or pass a
run.

## Related

- [CLI reference](/cli)
- [Status](/cli/status)
- [Sessions](/cli/sessions)
- [Tasks](/cli/tasks)
