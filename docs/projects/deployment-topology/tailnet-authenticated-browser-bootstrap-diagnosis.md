---
summary: "Diagnosis of the Tailnet browser auth bootstrap lane after live instrumentation proved token ingestion was already correct."
title: "Tailnet Authenticated Browser Bootstrap Diagnosis"
---

# Tailnet Authenticated Browser Bootstrap Diagnosis

## Exact diagnosis

The failing Tailnet browser lane was **not** caused by broken token bootstrap.

The startup chain already behaved correctly:

1. the page read `#token=...`
2. the page wrote the token into scoped session storage
3. the page cleared the URL hash
4. the first gateway `connect` used `auth.token`

The exact failure came one layer later:

- secure browser startup also generated and sent a fresh Control UI device identity
- the live gateway treated that browser as a fresh remote Control UI device
- the live gateway required pairing for that device
- the first `connect` therefore failed with `PAIRING_REQUIRED`

## Live proof that changed the diagnosis

Repo-backed live probe:

- `pnpm --dir ui exec node ../scripts/tailnet-auth-bootstrap-probe.mjs`

Observed facts:

- first URL seen by the browser:
  - `/chat?session=main#token=<token>`
- final URL after bootstrap:
  - `/chat?session=main`
- scoped session token key written:
  - `openclaw.control.token.v1:wss://srv1425839.tailbcf154.ts.net`
- first outbound `connect` frame:
  - `auth.token = present`
  - `device = present`
  - requested scopes:
    - `operator.admin`
    - `operator.read`
    - `operator.write`
    - `operator.approvals`
    - `operator.pairing`
- first inbound `connect` result:
  - `ok: false`
  - `error.message: "pairing required"`
  - `error.details.code: "PAIRING_REQUIRED"`

## Why the earlier assumption was wrong

The earlier assumption was:

- if `#token=...` works, the browser should skip the pairing screen

That assumption was incomplete because the secure browser client does more than
send a shared token. It also creates a device identity and signs the `connect`
request.

Relevant Control UI runtime truth:

- secure contexts call `loadOrCreateDeviceIdentity()`
- the first `connect` includes:
  - shared token auth when available
  - device identity and signature

That is the intended security posture, not a broken race.

## Exact runtime seam

Relevant client/runtime files:

- `ui/src/ui/app-settings.ts`
- `ui/src/ui/storage.ts`
- `ui/src/ui/app-lifecycle.ts`
- `ui/src/ui/app-gateway.ts`
- `ui/src/ui/gateway.ts`

Relevant gateway policy files:

- `src/gateway/server/ws-connection/connect-policy.ts`
- `src/gateway/server/ws-connection/message-handler.ts`
- `src/gateway/server.auth.control-ui.suite.ts`

## Correct fix path

The correct fix path was **not**:

- weakening Tailnet-safe gateway policy
- suppressing secure-context device identity
- pretending a fresh browser should be treated like an already paired device

The correct fix path was:

1. keep token bootstrap as-is because it was already correct
2. preserve secure browser device identity behavior
3. add a sanctioned automation proof path that:
   - opens the real Tailnet UI
   - creates the real pending Control UI device request
   - approves that exact device through the repo-backed CLI
   - reloads the same browser context
   - verifies authenticated UI and device-token persistence

## Resulting contract

For a fresh secure browser on the approved Tailnet origin:

- `#token=...` proves shared-token bootstrap
- it does **not** by itself prove the device is already paired
- authenticated browser automation requires approval of the exact browser device
- once approved, the same browser context can reload into authenticated Control
  UI state and persist:
  - `openclaw.device.auth.v1`

## Follow-on implementation from this diagnosis

Repo-backed helpers added:

- `scripts/tailnet-auth-bootstrap-probe.mjs`
- `scripts/tailnet-authenticated-browser-proof.mjs`

The successful approved-device browser proof lives in:

- [Tailnet Authenticated Browser Proof](/projects/deployment-topology/tailnet-authenticated-browser-proof)
