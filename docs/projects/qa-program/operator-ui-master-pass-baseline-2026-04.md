---
summary: "Baseline snapshot for the April 19, 2026 operator UI master inventory and evidence pass."
title: "Operator UI Master Pass Baseline 2026-04"
---

# Operator UI Master Pass Baseline 2026-04

## Repo baseline

- git root: `/root/services/openclaw-roles/live`
- branch: `main`
- `HEAD`: `a743cc82d2b9c2b00aa6b179ff3261ac1a888878`
- ahead/behind vs `origin/main`: `0 / 0`

## Scope scanned

- targeted docs scanned across project and system surfaces: `345`
- scan roots:
  - `docs/projects/deployment-topology/`
  - `docs/projects/qa-program/`
  - `docs/projects/model-memory/`
  - `docs/projects/agent-foundation/`
  - `docs/projects/workspace-topology/`
  - `docs/projects/turborepo/`
  - `docs/system/`

## Live proof baseline

Canonical helper:

```bash
node scripts/operator-ui-proof.mjs --json
```

Observed on `2026-04-19`:

- helper status: `ok`
- allowed origin:
  - `https://srv1425839.tailbcf154.ts.net`
- selector payload summary:
  - `sessionsList.count = 31`
  - `codexRowCount = 0`
- recent health session summary:
  - `recentCount = 0`
  - `recentCodexCount = 0`
- readiness:
  - `status = 200`
  - `x-openclaw-build-signature = 2026.4.15-beta.1+67e1f3477f5e`
  - `cache-control = no-store`

## Browser prerequisite truth

- the stale `codex-*` browser rows were already confirmed gone by direct human
  refresh check in the live Control UI
- the sanctioned Tailnet-safe browser path exists:
  - `scripts/tailnet-auth-bootstrap-probe.mjs`
  - `scripts/tailnet-authenticated-browser-proof.mjs`

## Same-pass proof commands executed

- `node scripts/operator-ui-proof.mjs --json`
- `pnpm exec turbo run check:root:all --filter=openclaw --dry=json`
- `pnpm exec turbo run test:root:all --filter=openclaw --dry=json`
- `pnpm exec turbo run build:root:all --filter=openclaw --dry=json`
- `pnpm --dir ui exec node ../scripts/tailnet-auth-bootstrap-probe.mjs`
- `pnpm --dir ui exec node ../scripts/tailnet-authenticated-browser-proof.mjs`

## Root-gate dry-run snapshot

- `check:root:all` dry-run task count: `13`
- representative root-stage tasks:
  - `openclaw#check:host-env-policy:swift`
  - `openclaw#check:import-cycles`
  - `openclaw#check:topology`
- `test:root:all` dry-run task count: `13`
- representative root-stage tasks:
  - `openclaw#test:root:agentic`
  - `openclaw#test:root:core-runtime`
  - `openclaw#test:root:extensions`
- `build:root:all` dry-run task count: `15`
- representative root-stage tasks:
  - `openclaw#build:root:build-stamp`
  - `openclaw#build:root:runtime-postbuild`
  - `openclaw#build:root:write-build-info`

## Browser auth snapshot

Bootstrap probe proved:

- `#token=...` was read
- scoped session storage key was populated:
  - `openclaw.control.token.v1:wss://srv1425839.tailbcf154.ts.net`
- first `connect` carried shared-token auth
- fresh secure browser device correctly hit `PAIRING_REQUIRED`

Approved-device browser proof proved:

- fresh device request id:
  - `b39345ee-4e54-4c0b-aede-9328a9cdce8d`
- post-approval reload rendered authenticated UI:
  - `hasSelector = true`
  - `selectorOptionCount = 7`
  - `hasLoginGate = false`
