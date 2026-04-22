---
summary: "Recorded attempt to run Playwright against the approved live Tailnet origin."
title: "Tailnet Native Playwright Attempt"
---

# Tailnet Native Playwright Attempt

## Objective

Attempt browser automation against the approved live Tailnet Control UI origin
without weakening gateway origin policy.

## Approved origin

- `https://srv1425839.tailbcf154.ts.net`

## What was proven

### Reachability

A headless browser session reached the approved live origin successfully and
loaded the real Control UI page:

- status `200`
- page title `OpenClaw Control`
- final URL under `/chat?session=main`

### Anonymous-browser behavior

The live page rendered the expected unauthenticated state:

- `unauthorized: gateway token missing`
- pairing/connect UI visible

That proves:

- Tailnet name resolution works
- network reachability works
- live origin policy allows the approved origin
- the remaining issue is auth/bootstrap inside the automated browser context,
  not origin reachability

## Auth bootstrap follow-up

The sanctioned token-resolution path also works separately:

```bash
pnpm exec tsx <<'EOF'
const [{ readConfigFileSnapshot }, { resolveGatewayAuthToken }] = await Promise.all([
  import('./src/config/config.ts'),
  import('./src/gateway/auth-token-resolution.ts'),
]);
const snapshot = await readConfigFileSnapshot();
const cfg = snapshot.valid ? (snapshot.sourceConfig ?? snapshot.config) : {};
const resolved = await resolveGatewayAuthToken({ cfg, env: process.env, envFallback: 'always' });
console.log(JSON.stringify({
  hasToken: Boolean(resolved.token),
  secretRefConfigured: Boolean(resolved.secretRefConfigured),
  unresolvedRefReason: resolved.unresolvedRefReason ?? null,
}, null, 2));
EOF
```

Observed result:

- `hasToken: true`
- `secretRefConfigured: true`

## Current exact blocker

The remaining automation gap is not Tailnet reachability.

An authenticated follow-up was attempted by loading:

- `https://srv1425839.tailbcf154.ts.net/chat?session=main#token=<resolved-token>`

Observed result:

- the page still landed on the pairing screen
- the browser reported `hash: ""`
- no authenticated session selector was rendered

That narrows the remaining gap to:

- the browser auth-bootstrap contract for the approved tokenized URL flow
- not Tailnet name resolution
- not gateway reachability
- not raw token availability

## Corrected diagnosis after live instrumentation

The tokenized URL bootstrap contract itself was not the blocker.

A repo-backed live browser probe showed:

- `#token=...` was read correctly
- scoped session storage was populated correctly
- the hash was cleared correctly
- the first `connect` frame did carry `auth.token`
- the same first `connect` also carried a fresh secure-browser `device`
- the gateway rejected that fresh remote Control UI device with:
  - `PAIRING_REQUIRED`

That means the real blocker was:

- approved remote Control UI device identity for a fresh browser context

not:

- token ingestion
- hash clearing
- first-connect auth omission

## Current status

- Tailnet-native Playwright origin reachability: `proven`
- Tailnet-native Playwright shared-token bootstrap: `proven`
- Tailnet-native Playwright authenticated browser automation through sanctioned
  device approval: `proven`
- exact final proof lives in:
  - [Tailnet Authenticated Browser Proof](/projects/deployment-topology/tailnet-authenticated-browser-proof)
