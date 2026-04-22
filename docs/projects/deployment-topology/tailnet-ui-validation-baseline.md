---
summary: "Baseline audit for the Tailnet-safe operator-surface validation sprint."
title: "Tailnet UI Validation Baseline"
---

# Tailnet UI Validation Baseline

## Repo and runtime baseline

- repo root: `/root/services/openclaw-roles/live`
- branch: `main`
- `HEAD`: `a743cc82d2b9c2b00aa6b179ff3261ac1a888878`
- live runtime container: `openclaw-runtime`
- live image tag: `openclaw:local`
- current live Tailnet Control UI origin:
  - `https://srv1425839.tailbcf154.ts.net`

## Starting contradiction

At the start of this sprint the operator-visible symptom was:

- the browser still showed four `codex-*` rows beneath Main after refresh

The starting evidence path split into three layers:

1. gateway truth
2. browser/UI state truth
3. displayed selector truth

The initial belief was that the gateway payloads were already clean and the
browser was preserving stale rows. The deeper proof path showed the contradiction
was more specific than that.

## Baseline proof collected

### Live gateway/runtime

- `node dist/index.js gateway status --json`
  - host-local RPC probe still abnormal-closes with `1006`
- `node dist/index.js gateway probe --json`
  - compose/live loopback probe succeeds against `ws://127.0.0.1:28789`
- `curl -sS -D - -o /tmp/openclaw-tailnet-readyz.out https://srv1425839.tailbcf154.ts.net/readyz`
  - readiness responds over the approved Tailnet origin
  - `cache-control: no-store`
  - `x-openclaw-build-signature: 2026.4.15-beta.1+fbc0c8393393`

### Session-list proof

- `node scripts/operator-ui-proof.mjs --json`
  - `ok: true`
  - `sessionsList.count: 40`
  - `sessionsList.codexRowCount: 4`
  - four rows still surfaced through the live selector path:
    - `agent:main:validation-background-replay`
    - `agent:main:validation-ingest-progress-direct`
    - `agent:main:validation-ingest-progress`
    - `agent:main:validation-progress-replay`

### Session metadata on the leaking rows

The four rows still visible to the operator resolved with legacy user-visible
metadata:

- `visibilityClass: "operator"`
- `retentionClass: "standard"`
- display/origin labels such as:
  - `codex-validation-bg-phase2`
  - `codex-validation-ingest-direct`
  - `codex-validation-ingest-phase1`
  - `codex-validation-phase2`

## Baseline conclusion

The visible rows are not only a browser-cache artifact.

The root live issue is:

- legacy validation/proof sessions are still classified as operator-visible in
  the running selector path

There is also a secondary UI hardening issue worth fixing regardless:

- a gateway-served Control UI page should not keep stale foreign gateway targets
  or stale static assets alive after refresh

That secondary hardening is useful, but it is not the main explanation for the
four still-visible rows.
