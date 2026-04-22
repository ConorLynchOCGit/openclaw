---
summary: "Focused local and live proof plan for the authenticated operator prompt harness."
title: "Authenticated Operator Prompt Harness Test Plan"
---

# Authenticated Operator Prompt Harness Test Plan

## Objective

Make the authenticated prompt harness durable enough that future operator/UI
evidence passes do not depend on one-off browser scripts or human memory.

## Coverage split

### Local focused coverage

Local tests cover deterministic support logic that does not require the live
Tailnet runtime:

- URL construction
- transcript-group normalization
- turn-summary extraction

Command:

```bash
node --test scripts/operator-browser-harness.test.mjs
```

### Existing live auth/bootstrap coverage

These helpers remain the canonical lower-level proof for Control UI bootstrap
and device approval:

```bash
pnpm --dir ui exec node ../scripts/tailnet-auth-bootstrap-probe.mjs
pnpm --dir ui exec node ../scripts/tailnet-authenticated-browser-proof.mjs
```

They prove:

- `#token` ingest ordering
- scoped session-token persistence
- hash clearing
- first `connect` auth payload
- fresh-device `PAIRING_REQUIRED`
- approval of the exact pending Control UI device
- authenticated reload of the same browser context

### Live prompt-execution coverage

The prompt harness itself must be proven live with transcript-visible evidence:

```bash
node scripts/operator-prompt-harness.mjs \
  --session main \
  --prompt 'Reply with exactly HARNESS_CLI and nothing else.' \
  --json
```

Minimum assertions:

- authenticated selector is present
- effective session key resolves to the canonical rendered key
- prompt is sent through the browser shell
- assistant reply appears in the rendered transcript
- websocket probe slice shows the corresponding `chat.send` frame and terminal
  `chat` event

### Specialist-lane proof

At least one specialist must be exercised through the same harness surface:

```bash
node scripts/operator-prompt-harness.mjs \
  --session agent:web-researcher:main \
  --prompt 'Open https://example.com in the browser tool and tell me the page title only.' \
  --json
```

## Higher-level tranche coverage

The canonical rerun driver is:

```bash
node scripts/rerun-blocked-operator-ui-tests.mjs
```

That script is the proof surface for:

- selector labeling and hygiene after repeated runs
- Main browser/search/fetch behavior
- delegation evidence
- specialist startup and pack behavior
- long-running progress and replay checks
- memory capture/retrieval checks
- ingest-progress/replay checks
- weekly maintenance specialist behavior

## Failure-handling expectations

The harness test plan is honest only if it distinguishes:

- harness failure
- runtime product failure
- missing live environment prerequisite

Examples:

- `EACCES` opening a specialist `AGENTS.md` file is a runtime/operator failure,
  not a harness pass
- missing daily/weekly review artifacts in the same pass is
  `blocked_by_environment`, not a harness failure
- a browser transcript showing `web_fetch` instead of the browser lane is a
  product-routing failure, not a browser-auth failure

## Canonical rerun evidence file

The April 19, 2026 rerun wrote:

- `/tmp/rerun-blocked-operator-ui-tests.json`

That output is the raw source for the updated QA matrix and results ledger for
this tranche.
