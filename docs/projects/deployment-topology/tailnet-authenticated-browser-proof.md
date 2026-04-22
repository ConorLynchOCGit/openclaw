---
summary: "Live Tailnet-native browser proof showing authenticated Control UI after sanctioned device approval in the same browser context."
title: "Tailnet Authenticated Browser Proof"
---

# Tailnet Authenticated Browser Proof

## Objective

Prove authenticated browser automation against the approved live Tailnet origin
without weakening gateway origin or auth policy.

Approved live origin:

- `https://srv1425839.tailbcf154.ts.net`

## Proof helpers

### Raw bootstrap probe

- `pnpm --dir ui exec node ../scripts/tailnet-auth-bootstrap-probe.mjs`

What it proves:

- `#token` ingestion
- scoped session-token persistence
- hash clearing
- first `connect` auth payload
- first `connect` result

### Approved-device browser proof

- `pnpm --dir ui exec node ../scripts/tailnet-authenticated-browser-proof.mjs`

What it proves:

1. the live Tailnet browser can open the real Control UI
2. the fresh browser device receives `PAIRING_REQUIRED`
3. the exact pending device request can be approved via repo-backed CLI
4. reloading the same browser context reaches authenticated Control UI state
5. the browser persists the issued device token

## Exact live result

### Initial browser pass

Observed from the live helper:

- `requestedDeviceId = b50bd61defbf92729d31c6263740fa350e9b41f3ffe31b991c6f46ac00281744`
- first outbound `connect`:
  - `hasDevice = true`
  - `hasToken = true`
- first inbound result:
  - `ok = false`
  - `errorCode = PAIRING_REQUIRED`
- page state:
  - `hasLoginGate = true`
  - authenticated shell not yet rendered

### Sanctioned approval

The same helper approved the exact pending request:

- `approvedRequestId = 887ba90c-4372-45f1-9927-5278c37b2b35`

Approved device record:

- matched the browser device id
- role:
  - `operator`
- scopes:
  - `operator.admin`
  - `operator.read`
  - `operator.write`
  - `operator.approvals`
  - `operator.pairing`

### Reload in the same browser context

After reload, the helper observed:

- `hasSelector = true`
- `selectorOptionCount = 7`
- `hasLoginGate = false`
- authenticated Control UI shell rendered
- body text included the authenticated nav and session surface, including:
  - `Chat`
  - `Chief Session`
  - `Weekly Maintenance Debt Guard`
  - `Web Researcher`
- local storage now contained:
  - `openclaw-device-identity-v1`
  - `openclaw.device.auth.v1`

The post-approval `connect` result returned:

- `hello-ok`
- `hello.auth.deviceToken = present`

That means the browser crossed the exact boundary that previously blocked
automation:

- from fresh paired-required device
- to approved authenticated Control UI device

## Exact conclusion

Tailnet-native browser automation is now proven usable **when it follows the
real device-approval contract**.

The correct sanctioned automation sequence is:

1. load the approved Tailnet Control UI URL with the shared token fragment
2. let the browser create the real Control UI device request
3. approve that exact pending request via repo-backed CLI
4. reload the same browser context
5. continue from authenticated Control UI state

## What this does not claim

This proof does **not** claim:

- that `#token=...` alone should bypass pairing for a fresh secure remote browser
- that gateway policy was loosened
- that localhost-origin fallback was needed

## Files and helpers that now matter

- `scripts/tailnet-auth-bootstrap-probe.mjs`
- `scripts/tailnet-authenticated-browser-proof.mjs`
- `ui/src/ui/gateway.ts`
- `ui/src/ui/storage.ts`
- `ui/src/ui/app-settings.ts`
- `src/gateway/server/ws-connection/connect-policy.ts`
- `src/gateway/server/ws-connection/message-handler.ts`
