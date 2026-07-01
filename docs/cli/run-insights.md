---
summary: "CLI reference for `openclaw run-insights` (compact run performance readback)"
read_when:
  - You want to understand why current or recent agent work feels slow
  - You need bounded performance evidence without reading raw transcripts
title: "`openclaw run-insights`"
---

`openclaw run-insights` summarizes recent run, session, and task performance
evidence from native readback surfaces.

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

It does not crawl raw transcripts by default. It emits pointers to deeper
surfaces when follow-up inspection is needed.

## Signals

The command surfaces advisory signals such as:

- active tasks;
- task failures;
- sessions that report an aborted last run;
- high context pressure;
- stale token estimates.

Signals are evidence for review. They do not deterministically fail or pass a
run.

## Related

- [CLI reference](/cli)
- [Status](/cli/status)
- [Sessions](/cli/sessions)
- [Tasks](/cli/tasks)
