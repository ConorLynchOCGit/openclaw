---
summary: "Sanctioned contract for authenticated prompt execution against the approved live Tailnet Control UI."
title: "Authenticated Operator Prompt Harness Spec"
---

# Authenticated Operator Prompt Harness Spec

## Objective

Define one sanctioned, repo-backed harness for running operator prompts through
the real authenticated Control UI without weakening Tailnet origin or device
policy.

## Canonical entrypoints

- low-level reusable library:
  - `scripts/lib/operator-browser-harness.mjs`
- direct CLI prompt runner:
  - `node scripts/operator-prompt-harness.mjs --session <key> --prompt <text> --json`
- tranche rerun driver:
  - `node scripts/rerun-blocked-operator-ui-tests.mjs`

## Approved runtime contract

The harness must use:

- approved live origin:
  - `https://srv1425839.tailbcf154.ts.net`
- real Control UI browser rendering
- the sanctioned shared-token bootstrap path
- the real Control UI device identity and approval contract

The harness must not:

- talk directly to hidden chat internals and call that UI proof
- replace Tailnet origin policy with localhost or wildcard fallbacks
- bypass device approval for a fresh secure remote browser

## Auth and bootstrap contract

### First authenticated browser bootstrap

1. build `/chat?session=<alias>#token=<token>` for the approved origin
2. load the real Control UI page
3. let the page perform the normal token-ingest startup path
4. if the page lands on the login/pairing gate, discover the exact pending
   device request created by that browser
5. approve that exact request via repo-backed CLI
6. reload the same browser context
7. continue only after the authenticated chat shell exposes the textarea and no
   login gate remains

### Reuse contract

After the first approved bootstrap, the harness reuses the same persistent
browser profile and device auth for later turns. It should not keep forcing the
shared token into every subsequent authenticated navigation once device auth is
already present.

Canonical persistent profile location:

- `/root/.openclaw/playwright/operator-browser-harness`

## Session contract

The harness accepts either:

- session aliases such as `main`
- canonical session keys such as `agent:web-researcher:main`

The authoritative runtime session key for transcript waits is the selected
option value rendered by the authenticated Control UI, not the user-supplied
alias alone.

This is required because:

- `main` resolves to rendered key `agent:main:main`
- transcript wait logic must follow the actual session key used in websocket
  chat events

## Prompt execution contract

The harness proves prompt execution only when it:

1. opens the real chat view for the requested session
2. fills the real textarea in the browser
3. clicks the real send/queue button
4. waits for one of the sanctioned terminal conditions
5. captures the rendered transcript plus websocket probe slice

Supported wait modes:

- `terminal`
  - wait for chat `final`, `error`, or `aborted`
- `progress`
  - wait for bounded progress evidence such as `Queued:`, `Working:`,
    `Completed:`, active queue UI, or live chat delta/final traffic

## Evidence contract

Each prompt run returns a structured payload containing:

- `prompt`
- `sessionKey`
- `waitFor`
- `before`
- `after`
- `probeSlice`
- `summary`

### `before` and `after`

These snapshots capture:

- current URL and hash state
- selected session and selector options
- login-gate presence
- textarea/send-button readiness
- queue title and queue items
- normalized rendered transcript groups
- session/local storage keys
- device identity and device-auth summaries
- bounded body-text snippet for diagnostics

### `probeSlice`

This is the incremental browser probe evidence captured only for the current
turn:

- websocket frames sent by the page
- websocket messages received by the page
- websocket closes
- history operations
- session-storage writes

### `summary`

This is the compact turn digest used by higher-level scripts:

- prompt
- effective session key
- last user text
- last assistant text
- transcript group count

## Specialist-lane contract

The harness must work for:

- Main
- `agent:web-researcher:main`
- `agent:builder:main`
- `agent:writer:main`
- `agent:x-manager:main`
- any other operator-visible selector lane that the live runtime exposes

If a lane is absent from the selector or fails during startup, that is recorded
as test evidence rather than silently skipped.

## Trust boundaries

### Browser-rendered transcript truth

Authoritative for:

- what the operator actually sees
- visible selector labels
- rendered chat output
- visible login/pairing state
- visible progress/replay behavior

### Gateway/helper truth

Authoritative for:

- live session payload inventory
- build signature and readiness
- pending device request inventory and approval

### Combined proof

Some tests require both:

- browser truth for rendered behavior
- gateway/helper truth for supporting classification or cross-session evidence

Examples:

- delegated research
- selector hygiene after multiple runs
- daily review and digest lanes

## What this harness proves

- the approved live Tailnet Control UI can be reached in authenticated state
- Main and visible specialist lanes can be driven through the real UI
- prompts are submitted through the real browser shell
- rendered transcript output is captured structurally
- same-session follow-up turns can be executed in one persistent browser
  context
- replay/progress/session-state checks can be graded from browser-visible
  evidence instead of human memory

## What this harness does not prove by itself

- that a background job or scheduled artifact exists when the environment did
  not create one during the pass
- that a missing specialist lane is healthy
- that hidden runtime work is correct when it never surfaces in the browser or
  sanctioned helper evidence
- that direct backend logs alone are sufficient for transcript-visible claims
