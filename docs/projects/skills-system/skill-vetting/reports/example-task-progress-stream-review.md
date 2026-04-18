---
summary: "Operator-facing example review for the third-party task-progress-stream skill."
title: "Skill Review: task-progress-stream"
review:
  slug: task-progress-stream
  version: 0.1.0
  outcome: inspire
  riskTier: high
  generatedAt: 2026-04-18T02:20:01Z
---

# Skill Review: task-progress-stream

## Decision Snapshot

- Outcome: `inspire`
- Risk tier: `high`
- Verdict: the product idea is useful, but the shipped implementation is too
  broad and unsafe to install directly in the live workspace.
- Install conditions: none; direct install is not approved from this review.
- Operator recommendation: borrow the product pattern, not the code.

## Acquisition Record

| Field                 | Value                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Skill slug            | `task-progress-stream`                                                                          |
| Version               | `0.1.0`                                                                                         |
| Source                | ClawHub                                                                                         |
| Search path used      | runtime-container `openclaw skills search`, host `clawhub search`                               |
| Acquisition path used | host `skills/skill-vetting/scripts/quarantine_clawhub_skill.sh task-progress-stream`            |
| Force required        | yes; the helper uses `--force` in quarantine only                                               |
| Quarantine path       | `/tmp/openclaw-skill-vetting/task-progress-stream-20260418T022001Z/skills/task-progress-stream` |
| Review scope mode     | `quarantine_review`                                                                             |

## Runtime Surface Proof

| Surface                      | Availability | Observation                                                  |
| ---------------------------- | ------------ | ------------------------------------------------------------ |
| host `openclaw`              | missing      | `command -v openclaw` returned no path                       |
| host `clawhub`               | available    | `/usr/bin/clawhub`                                           |
| runtime-container `openclaw` | available    | `/usr/local/bin/openclaw` and native search returned results |
| runtime-container `clawhub`  | missing      | `command -v clawhub` in container returned no path           |

## Review Evidence

### Files inspected

- `SKILL.md`
- `scripts/task_progress_stream.js`
- `.clawhub/origin.json`
- `_meta.json`

### Scripts inspected

- `scripts/task_progress_stream.js`

### Command surfaces found

- spawns `openclaw gateway call chat.inject`
- spawns `/bin/bash -lc <user-supplied-cmd>`

### Filesystem surfaces found

- writes JSON, Markdown, and log artifacts under a caller-controlled `out-dir`
- tails caller-supplied log files
- reads from caller-supplied cwd and file paths

### Network / secret surfaces found

- no direct HTTP client code found
- indirect gateway interaction via `openclaw gateway call chat.inject`
- no explicit secret-file reads found

## Risk Summary

| Severity | Surface                     | Evidence                                           | Why it matters                                                               | Blocks install |
| -------- | --------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| `high`   | arbitrary command execution | `spawn(\"/bin/bash\", [\"-lc\", cmd], ...)`        | runs caller-supplied shell commands with broad freedom                       | yes            |
| `high`   | chat injection              | `openclaw gateway call chat.inject`                | writes agent-visible progress into chat outside normal runtime policy review | yes            |
| `medium` | broad file tailing          | caller-supplied `--file` is tailed directly        | allows monitoring arbitrary log paths without a bounded path contract        | yes            |
| `medium` | persistent local artifacts  | writes `.status.json`, `.status.md`, `.stream.log` | adds filesystem residue without explicit ownership rules                     | no             |

## Borrow The Idea, Not The Code

### Useful patterns

- visible progress updates in chat for long-running work
- compact periodic summaries instead of raw log spam
- separate status artifact files for operator debugging

### Unsafe or nonconforming parts

- raw `/bin/bash -lc` execution
- direct `chat.inject` use from an external script
- arbitrary file tailing without a narrow runtime-owned path contract

### Recommended next output

- native OpenClaw implementation work, not direct installation
- specifically: chat-visible queue/progress inside the runtime control plane

## Decision Routing

- Outcome route: `inspire`
- Policy follow-on: keep this out of any future allowlist
- Next design follow-on: use the product idea to improve native queue/progress
  visibility in chat
- Operator reporting follow-on: none required beyond this saved example report
