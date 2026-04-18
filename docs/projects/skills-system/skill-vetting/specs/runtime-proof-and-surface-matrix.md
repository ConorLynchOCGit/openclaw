---
summary: "Required surface matrix and proof contract for Skill Vetting search and quarantine flows."
title: "Runtime Proof And Surface Matrix"
---

# Runtime Proof And Surface Matrix

Skill Vetting has to distinguish between three different capabilities:

1. native trusted workspace skill search/install
2. separate ClawHub discovery
3. quarantine-only acquisition for review

Those capabilities can exist on different runtime surfaces at the same time.

## Required proof matrix

| Surface           | Capability to prove      | Required proof                                                       |
| ----------------- | ------------------------ | -------------------------------------------------------------------- |
| host shell        | `openclaw skills search` | `command -v openclaw` plus a real search command or explicit absence |
| host shell        | `clawhub search`         | `command -v clawhub` plus a real search command                      |
| host shell        | quarantine acquisition   | successful quarantine helper run or explicit blocker                 |
| runtime container | `openclaw skills search` | `docker exec <runtime> openclaw skills search ...`                   |
| runtime container | `clawhub`                | `docker exec <runtime> command -v clawhub` or explicit absence       |

## Decision rules

### Search

Preferred search order:

1. native `openclaw skills search` on the intended OpenClaw runtime surface
2. `clawhub search` on the host if native search is unavailable there

### Acquisition

Preferred quarantine acquisition path:

- host `clawhub install <slug> --workdir <quarantine> --dir skills --no-input`

Current assumption:

- quarantine acquisition is normally a host-shell responsibility because it
  should not write into the live runtime workspace

### Trusted install

Trusted install is a separate action from review.

It may use:

- `openclaw skills install <slug>`

but only after the report outcome is `install`.

## Blocked states

The report must distinguish:

- `native_search_blocked`
- `clawhub_missing`
- `quarantine_acquisition_blocked`
- `runtime_surface_missing`

Do not collapse those into one vague “not available” note.

## Current live matrix example

The current live environment demonstrates that capability split is real:

- host shell:
  - `openclaw`: missing
  - `clawhub`: available
- runtime container:
  - `openclaw`: available
  - `clawhub`: not currently available

That means:

- native search proof can come from the runtime container
- quarantine acquisition currently comes from host `clawhub`

The operator-facing report must record that split explicitly.
