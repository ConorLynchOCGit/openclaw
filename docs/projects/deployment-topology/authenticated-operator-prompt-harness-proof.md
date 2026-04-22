---
summary: "Live proof that the authenticated operator prompt harness can drive Main and specialist prompts through the approved Tailnet Control UI."
title: "Authenticated Operator Prompt Harness Proof"
---

# Authenticated Operator Prompt Harness Proof

## Objective

Prove that the sanctioned authenticated prompt harness works end to end against
the approved live Tailnet Control UI path.

Approved live origin:

- `https://srv1425839.tailbcf154.ts.net`

## Canonical commands

### Main proof

```bash
node scripts/operator-prompt-harness.mjs \
  --session main \
  --prompt 'Reply with exactly HARNESS_POST and nothing else.' \
  --json
```

### Specialist proof

```bash
node scripts/operator-prompt-harness.mjs \
  --session agent:web-researcher:main \
  --prompt 'Open https://example.com in the browser tool and tell me the page title only.' \
  --json
```

## Exact Main proof

The Main proof succeeded with:

- effective session key:
  - `agent:main:main`
- selected rendered label:
  - `Main Session`
- assistant reply:
  - `HARNESS_POST`

The browser probe slice for that run showed:

- outbound `chat.send` frame on the canonical Main session key
- matching inbound `chat` terminal event

That proves:

- the harness opened the authenticated UI
- it targeted the real Main session selected by the UI
- it sent the prompt through the browser shell
- it captured rendered transcript output rather than only backend logs

The same validation also captured current selector-state truth during the run:

- one label still regressed to raw slug:
  - `weekly-maintenance-debt-guard`

That is a product issue surfaced by the harness, not a harness failure.

## Exact follow-up proof

The same persistent authenticated browser context also handled additional Main
turns such as:

- `Reply with exactly HARNESS_TRACE and nothing else.`

Observed result:

- assistant reply:
  - `HARNESS_TRACE`

That proves same-session reuse in one authenticated browser profile.

## Exact specialist proof

The specialist proof succeeded with:

- session:
  - `agent:web-researcher:main`
- selected rendered label:
  - `Web Researcher`
- prompt:
  - `Open https://example.com in the browser tool and tell me the page title only.`
- assistant reply:
  - `Example Domain`

That proves the harness is not Main-only and can drive at least one specialist
lane through the same authenticated browser path.

## Rerun proof

The higher-level rerun driver:

```bash
node scripts/rerun-blocked-operator-ui-tests.mjs
```

completed successfully across the previously blocked 29-test tranche.

Exact rerun window:

- started:
  - `2026-04-19T12:48:39.921Z`
- finished:
  - `2026-04-19T13:00:13.037Z`

Exact rerun counts:

- `pass = 10`
- `fail = 15`
- `blocked_by_environment = 4`

That proves the harness was durable enough to move the broader operator/UI
matrix from “blocked due to missing prompt lane” to current pass/fail evidence.

## What this proof does not claim

This proof does not claim that:

- every operator/UI behavior is healthy
- missing review artifacts or digest artifacts were present in the same pass
- Builder and Writer specialist startup failures are solved
- progress/replay/ingest behavior is healthy

It proves only that the browser-visible authenticated prompt lane now exists
and can be used to grade those behaviors honestly.
