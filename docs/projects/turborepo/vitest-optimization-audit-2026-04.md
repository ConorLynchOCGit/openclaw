---
summary: "Repo-grounded Vitest optimization options based on current targeted runs, existing scripts, and the new operator/browser harness lane."
title: "Vitest Optimization Audit 2026-04"
---

# Vitest Optimization Audit 2026-04

## What was actually observed

Recent targeted test runs in this repo still show non-trivial startup cost even
for narrow invocations.

Concrete symptoms observed in this pass:

- focused `vitest run` repeatedly emitted plugin timing warnings for:
  - `inject-file-scope-variables`
  - `externalize-deps`
- the smallest targeted proofs were often cheaper through repo-backed
  lightweight harnesses than through a fresh Vitest boot
- a direct narrow UI run still paid most of its cost in environment/setup, not
  assertion time:
  - command:
    - `timeout 90s pnpm exec vitest run ui/src/ui/views/sessions.test.ts --reporter=verbose`
  - observed duration:
    - `1.20s`
  - breakdown:
    - `transform 140ms`
    - `setup 45ms`
    - `import 147ms`
    - `tests 144ms`
    - `environment 705ms`
- full unit profiling in this landing confirmed the same shape at larger scale:
  - `node scripts/run-vitest-profile.mjs main`
  - `173` files / `1758` tests / `93.32s`
  - `transform 4.04s`
  - `setup 1.31s`
  - `import 10.25s`
  - `tests 79.48s`
  - `environment 2.84s`
- runner-side profiling showed similar non-test overhead plus a slightly slower
  execution envelope:
  - `node scripts/run-vitest-profile.mjs runner`
  - `173` files / `1758` tests / `102.88s`
  - `transform 4.73s`
  - `setup 1.46s`
  - `import 10.35s`
  - `tests 88.71s`
  - `environment 2.45s`
- the current hotspot report shows the dominant expensive files are not the
  narrow bootstrap/UI seams touched in this pass:
  - top five from `node scripts/test-hotspots.mjs --config test/vitest/vitest.unit.config.ts --limit 20`
  - `src/security/audit-extra.sync.test.ts` at `46.30s`
  - `src/security/audit-channel-discord-allowlists.test.ts` at `34.01s`
  - `src/security/audit-channel-readonly-resolution.test.ts` at `27.47s`
  - `src/memory-host-sdk/host/embeddings-lmstudio.test.ts` at `25.95s`
  - `src/security/audit-channel-telegram-command-findings.test.ts` at `25.85s`

Concrete examples already exercised in this repo:

- `node --test scripts/operator-browser-harness.test.mjs`
- `pnpm exec vitest run src/agents/system-prompt.test.ts src/agents/openclaw-tools.session-status.test.ts ui/src/ui/views/sessions.test.ts`

## Existing repo-owned optimization surfaces

The repo already has real tools for narrowing and profiling, which means the
next work should build on them rather than inventing a parallel test story.

Current useful surfaces:

- `scripts/test-projects.mjs`
- `scripts/run-vitest.mjs`
- `scripts/run-vitest-profile.mjs`
- `scripts/test-hotspots.mjs`
- `scripts/test-unit-fast-audit.mjs`
- the new operator/browser harness tests under `scripts/`

## Best immediate win

### Use lightweight harnesses for narrow seam proof

Best immediate move:

- keep moving tiny runtime/assertion seams out of ad hoc focused Vitest runs and
  into repo-owned `node:test` or similarly lightweight harnesses when browser
  rendering or large integration setup is not needed

Immediate landing now completed:

- `scripts/bootstrap-memory-ownership.test.ts`
- package entrypoint:
  - `pnpm test:bootstrap:memory`
- scope proven there:
  - curated `MEMORY.md` ownership stripping
  - canonicalized bootstrap-file overlay by filename for stale session caches

Why:

- it cuts Rolldown/Vitest startup churn
- it keeps proof authority explicit
- it avoids paying the full plugin/transform stack for tiny behavioral seams

Good candidates:

- script-only parsing/formatting helpers
- operator-proof helper logic
- browser harness helper parsing/serialization logic
- small status/render helper assertions

Not good candidates:

- real UI integration behavior
- gateway/runtime integration that depends on existing Vitest fixtures
- behavior that needs the existing unit/integration test harnesses

## Best medium-term structural win

### Expand honest package/test ownership instead of more ad hoc root runs

Best medium-term move:

- continue shifting tests into clearer package-owned or graph-owned shards so
  narrow changes can run a smaller owned lane through the existing root graph

Why:

- the repo already has decomposed root `test:root:*` stages
- the main remaining cost is still centralized ownership and broad startup
  surfaces
- more honest ownership gives Turbo and targeted test runners something real to
  orchestrate

## Specific next profiling move

This landing already ran the existing profiling entrypoints:

```bash
node scripts/run-vitest-profile.mjs main
node scripts/run-vitest-profile.mjs runner
node scripts/test-hotspots.mjs --config test/vitest/vitest.unit.config.ts --limit 20
```

Current answer:

- focused tiny seams still pay visible plugin/import/environment startup tax
- the heavy end of the full unit lane is dominated by a small set of security
  and embeddings files, not by the new bootstrap-memory seam
- moving the bootstrap-memory proof out of ad hoc Vitest focus runs was a safe
  immediate win because it avoided startup churn without disturbing ownership of
  those heavier unit lanes

## Recommended operating split

### Prefer the new operator/browser harness when:

- the proof target is live operator-visible behavior
- the question is "what does the authenticated UI actually show?"
- browser transcript/state is the authority

### Prefer lightweight `node:test` harnesses when:

- the seam is a small helper/parser/serializer
- no Vitest fixture stack is needed
- a faster, deterministic proof surface exists

### Prefer Vitest when:

- the seam belongs to existing unit/integration ownership
- shared mocks/fixtures matter
- regression coverage needs to stay in the standard repo test lane

## Options rejected for now

### Rejected: weaken correctness gates

Not acceptable:

- dropping meaningful integration coverage just to lower runtime
- replacing browser-visible proofs with shell-only claims

### Rejected: use Turbo as a cosmetic speed story

Not acceptable:

- claiming Turbo solves startup cost when ownership is still root-heavy

### Rejected: migrate everything out of Vitest

Not acceptable:

- building a second overlapping test system for behavior that already belongs in
  the existing unit/integration suites

## Recommendation set

### Recommended now

1. keep using lightweight harnesses for narrow proof seams
2. target the real hotspots next rather than broad config churn
3. continue honest test-ownership extraction so focused work runs smaller lanes

### Recommended next slice

Run a dedicated hotspot-reduction tranche against:

- `src/security/audit-extra.sync.test.ts`
- `src/security/audit-channel-discord-allowlists.test.ts`
- `src/security/audit-channel-readonly-resolution.test.ts`
- the expensive embeddings-host tests shown in the current hotspot report

Deliverables for that slice should be:

- measured before/after profile artifacts
- one or two concrete ownership or fixture-scope changes, if the hotspot review
  justifies them
- no weakening of the standard correctness gates

## Bottom line

The best immediate Vitest optimization is not a risky config tweak. It is a
disciplined split:

- live/browser-visible proof through the authenticated operator harness
- tiny seam proof through lightweight repo-owned harnesses
- real unit/integration regression coverage left in Vitest

The next structural win comes from profiling plus broader honest ownership, not
from pretending the current root-heavy graph is already cheap.
