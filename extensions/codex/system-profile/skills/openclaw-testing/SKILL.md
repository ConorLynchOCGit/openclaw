---
name: openclaw-testing
description: Choose and run the smallest authoritative OpenClaw validation lane for a change.
---

# OpenClaw Testing

Prove the touched contract first, then broaden only when its blast radius requires it.

## Routing Contract

1. Inspect the diff and identify the owning package, runtime, UI, browser, or deployment surface.
2. Use `node scripts/test-projects.mjs <targets...>` for focused Vitest routing. Pass related targets together so the dispatcher owns one lock and shards internally.
3. Run TypeScript separately from Vitest.
4. Route `*.browser.test.ts` through `ui/vitest.config.ts`; route Control UI `*.e2e.test.ts` through `test/vitest/vitest.ui-e2e.config.ts`.
5. Reproduce a failure narrowly, fix its cause, rerun the same proof, then add only the representative regression lanes the changed contract requires.
6. Use the deployed candidate/container for browser or service-user behavior that the host cannot reproduce faithfully.
7. Never call a skipped, missing-browser, wrong-runtime, or structurally mocked lane a product proof.

## Guardrails

- Do not run broad suites, Docker builds, or release validation by reflex.
- Do not kill unrelated processes or reuse another operator's remote run id.
- Do not use raw Vitest when the repository dispatcher owns routing and worker limits.
- Do not let `pnpm` reconcile a linked or mismatched dependency store merely to run a focused test; use installed local binaries and the repository dispatcher.
- Record the exact command, runtime context, result, and any unproven boundary.

Read [the detailed testing guide](references/testing-guide.md) only for CI, release, remote Testbox/Crabbox, Docker, or unusual failure-recovery procedures.
