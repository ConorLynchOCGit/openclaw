---
summary: "Search and acquisition contract for third-party skill review via ClawHub-related tooling."
title: "ClawHub Search And Acquisition"
---

# ClawHub Search And Acquisition

## Objective

Define the canonical search and acquisition posture for external skill review.

## Search paths

Preferred order:

1. native `openclaw skills search`
   - use when native OpenClaw CLI search is available
2. `clawhub search`
   - use when the separate ClawHub CLI is available

Search alone does not authorize installation.

## Acquisition paths

Preferred acquisition path for review:

1. `clawhub install <slug> --workdir <quarantine-workdir> --dir skills`

This keeps the download inside quarantine rather than the live workspace.

If the registry flags a package as suspicious, quarantine review may add
`--force` at this acquisition step only. That override is acceptable because:

- the bundle still lands in quarantine
- the review outcome is still pending
- no live workspace approval has happened yet

## Why native install is not the review acquisition path

`openclaw skills install <slug>` writes into the active workspace skill
directory.

That is appropriate for trusted installs, not for first-pass review of an
untrusted third-party bundle.

## Blocked state

If search is available but quarantine-safe acquisition is not, the review may
continue only as:

- search-only triage
- source/documentation review
- blocked-on-acquisition

It must not silently downgrade into a live workspace install.

## Operator-facing output

Every review using ClawHub-related discovery should record:

- which search path was used
- which acquisition path was used
- whether acquisition was blocked
- whether the result was `install`, `inspire`, or `reject`
