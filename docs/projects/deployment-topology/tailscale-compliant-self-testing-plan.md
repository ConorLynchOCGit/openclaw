---
summary: "Safe planning doc for Tailscale-compliant self-testing of Control UI, chat replay, and operator-visible runtime behavior without weakening live gateway policy."
title: "Tailscale-Compliant Self-Testing Plan"
---

# Tailscale-Compliant Self-Testing Plan

## Why this exists

Recent replay and chat-progress validation exposed a real operator-testing gap:

- the live runtime is correctly preserving the Tailnet-first Control UI origin
  posture
- local browser automation against `http://127.0.0.1:28789` is not the same as
  the approved operator path
- the current `dashboard` loopback URL behavior and the live
  `gateway.controlUi.allowedOrigins` policy are not sufficient for safe,
  repeatable Codex-side UI validation

This plan exists to create a safe self-testing path without loosening the live
gateway/Tailscale security posture.

## Current truth

- live gateway bind is currently `lan`
- live Control UI allowed origins are currently Tailnet-specific, not broad
  loopback/browser-development origins
- local browser automation from Codex currently hits:
  - `origin not allowed`
- raw shared-token websocket connects are not equivalent to a real operator UI
  surface:
  - device-bound scope policy applies
  - local CLI/gateway helper paths and bare websocket paths behave differently
- previous attempts in this area created rollback risk for the live gateway, so
  policy changes must be additive, bounded, and reversible

## Hard constraints

- do not break the working Tailnet operator path
- do not replace the current Tailnet allowlist with wildcard or broad localhost
  origins
- do not enable dangerous host-header fallback globally
- do not treat shell-only or raw websocket-only proof as equivalent to real
  operator-facing UI proof
- do not force Codex UI testing by weakening gateway auth/origin discipline

## Testing goals

The eventual self-test path must let Codex validate at least:

1. live bounded chat progress during active long-running work
2. detached replay after returning to an active session
3. replay dedupe on follow-up
4. session UI vs chat parity
5. memory ingest or benchmark replay from the actual operator surface

## Candidate approaches

### Option A — Tailnet-native browser automation

Use the real Tailnet Control UI origin and tokenized dashboard flow that human
operators already use.

Expected shape:

- Codex opens the Tailnet Control UI hostname already present in the live
  allowlist
- browser automation runs against that approved origin
- auth uses the same dashboard/token flow as a human operator

Advantages:

- matches the real operator path
- avoids origin-policy drift between testing and production use
- preserves the current Control UI security model

Risks / blockers:

- Codex/runtime needs a reliable way to reach the Tailnet hostname from the
  current execution environment
- browser automation must be able to authenticate without manual UI drift
- may require explicit documentation of the runtime/browser path Codex should
  use for Tailnet UI sessions

Current posture:

- preferred long-term path if environment access is reliable

### Option B — Additive local operator test origin

Allow one exact local testing origin in addition to the existing Tailnet origin,
without replacing the current allowlist.

Expected shape:

- preserve the current Tailnet origin(s)
- add one explicit local origin only if necessary for automation
- keep the rule exact and documented

Advantages:

- simple to reason about
- easier to automate on the VPS host itself

Risks / blockers:

- still changes live origin policy
- easy to get wrong if broadened beyond one exact origin
- must not be treated as the canonical operator path if real operators use the
  Tailnet URL

Current posture:

- acceptable only if Tailnet-native automation proves impractical
- must be additive, not substitutive

### Option C — Device-auth-backed operator test client

Create a sanctioned non-browser validation client that uses the same local
device/auth pathway as approved operator tooling, then use it for bounded
session/chat event proof where full UI rendering is not required.

Expected shape:

- reuse the gateway client/device-auth machinery instead of a raw shared-token
  websocket
- prove the same runtime state that the UI consumes
- pair this with human UI checks where browser proof is still needed

Advantages:

- safer than ad hoc websocket probing
- useful for runtime parity and replay-state validation
- can cover more cases than browser-only testing

Risks / blockers:

- does not replace true UI validation
- still needs a separate solution for rendered Control UI proof

Current posture:

- strong supporting path, but not the only answer

## Recommended phased plan

### Phase 0 — No policy change

Do now:

- keep Tailnet origin policy unchanged
- continue human validation on the approved live UI path
- document the exact blocked local automation behavior and why it is blocked

Exit criteria:

- operator-facing checks continue without destabilizing the gateway

### Phase 1 — Build the sanctioned non-browser proof path

Do next:

- create a repo-backed validation helper that uses the sanctioned gateway
  client/device-auth path rather than a raw websocket connect
- use it to validate:
  - chat delta emission
  - detached replay state
  - replay dedupe
  - session/task parity data

Exit criteria:

- Codex can prove most runtime replay behavior without touching origin policy

### Phase 2 — Attempt Tailnet-native browser automation

Do after Phase 1:

- validate whether the execution environment can browse the approved Tailnet
  Control UI origin directly
- use the tokenized dashboard flow or equivalent sanctioned auth path
- run Playwright or the repo’s browser-backed UI harness against the real
  Tailnet origin

Exit criteria:

- Codex can exercise the same UI path as human operators without broadening
  origin policy

### Phase 3 — Add a local origin only if Tailnet-native automation is not viable

Only if Phase 2 is not feasible:

- add one exact local origin entry for operator testing
- preserve all existing Tailnet allowlist entries
- document:
  - why the additive origin is needed
  - exact allowed value
  - exact rollback path
  - exact proof that Tailnet behavior remains intact

Exit criteria:

- local automation works
- Tailnet path still works
- no wildcard or dangerous fallback was introduced

## Required proof before any origin-policy change

Before changing live origin policy, collect all of:

1. exact current `gateway.controlUi.allowedOrigins`
2. exact current `gateway.bind`
3. proof that the Tailnet operator UI currently works
4. proof that the blocked automation path is genuinely blocked by origin policy,
   not auth, token, or browser setup
5. proof that the proposed change is additive rather than substitutive
6. explicit rollback steps

## Required proof after any future change

If a future tranche changes origin policy, it must prove:

1. Tailnet Control UI still connects
2. local/bounded test path works only as intended
3. no wildcard or unsafe host-header fallback was introduced
4. `dashboard` output, live config, and operator docs agree
5. replay/progress validation can now run from the intended Codex path

## Things we will not do

- no wildcard `allowedOrigins`
- no replacement of Tailnet origin entries with loopback-only entries
- no global dangerous host-header-origin fallback to make automation easier
- no pretending raw websocket probes are full UI proof
- no silent policy changes without live Tailnet regression checks

## Immediate next step

Do not change runtime policy in this tranche.

Use:

- human validation for the live Tailnet UI path now
- a future focused tranche to build the sanctioned device-auth-backed validation
  helper
- a separate focused tranche to attempt Tailnet-native browser automation

That order keeps the live gateway stable while still moving toward full
Codex-operated operator-surface validation.
