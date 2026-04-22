---
summary: "Baseline for the Tailnet authenticated browser bootstrap investigation after the stale-row browser leak was cleared."
title: "Tailnet Authenticated Browser Bootstrap Baseline"
---

# Tailnet Authenticated Browser Bootstrap Baseline

## Baseline date

- `2026-04-19`

## Preconditions confirmed

- live repo checkout is the canonical live repo on `main`
- live gateway payload proof was already clean:
  - `node scripts/operator-ui-proof.mjs --json`
  - `sessionsList.codexRowCount = 0`
- human browser confirmation was explicit:
  - stale `codex-*` rows were gone after refresh

## Exact remaining question at sprint start

Whether the Control UI browser startup chain for:

- `/chat?session=main#token=<token>`

was broken in the browser, specifically around:

1. reading `#token=...`
2. persisting scoped token state
3. clearing the hash
4. sending the first authenticated gateway `connect`
5. rendering authenticated UI instead of the pairing screen

## Initial observed symptom

- Tailnet-native Playwright could reach:
  - `https://srv1425839.tailbcf154.ts.net`
- the page loaded successfully
- the browser still landed on the pairing screen
- no authenticated session UI was visible

## Initial hypothesis before instrumentation

The likely failure seam looked like one of:

- token captured too late
- token cleared before persistence
- token written under the wrong gateway scope
- first connect started before scoped token persistence
- startup navigation reset auth state before the initial gateway connect

## Outcome after first live instrumentation pass

The browser startup chain was not the actual failure.

The live instrumented probe showed:

- `#token=...` was present on first load
- scoped session storage was populated under:
  - `openclaw.control.token.v1:wss://srv1425839.tailbcf154.ts.net`
- the hash was cleared
- the first gateway `connect` frame carried:
  - `auth.token`
- the same first `connect` frame also carried:
  - a fresh browser-generated `device`
- the gateway answered that first `connect` with:
  - `PAIRING_REQUIRED`

That moved the diagnosis from:

- browser token-bootstrap race

to:

- fresh secure browser device pairing on remote Tailnet Control UI

The follow-on diagnosis and proof live in:

- [Tailnet Authenticated Browser Bootstrap Diagnosis](/projects/deployment-topology/tailnet-authenticated-browser-bootstrap-diagnosis)
- [Tailnet Authenticated Browser Proof](/projects/deployment-topology/tailnet-authenticated-browser-proof)
