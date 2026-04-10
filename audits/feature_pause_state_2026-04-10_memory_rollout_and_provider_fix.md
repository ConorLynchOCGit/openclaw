# Feature Pause State — 2026-04-10

## Scope

Paused feature closeout scope:

1. Fix the repo-wide red in `src/plugins/providers.test.ts`.
2. Implement the first five slices of the next native-memory rollout tranche:
   - project allowlist rollout
   - operator projection report
   - daily brief integration
   - host-cron scheduled projection refresh
   - manual sync command hardening
3. Run the required validation.
4. Commit and push only after the full tree is green.

This pause record exists so the workflow diagnosis pass can proceed without
losing the exact feature resume point.

## Completed Work

Completed in the engineering repo:

- `src/plugins/providers.test.ts`
  - replaced stale top-level ESM module mocks with import-time module loading
    plus `vi.spyOn(...)`
- `test/vitest-config.test.ts`
  - updated the safe-mode budget expectation to the current runtime-profile
    value
- memory rollout tranche implementation:
  - `extensions/memory-middleware/src/native-memory-projection-routing.ts`
  - `extensions/memory-middleware/src/native-memory-projection-routing.test.ts`
  - `extensions/memory-middleware/src/native-memory-projection-projects.ts`
  - `extensions/memory-middleware/src/native-memory-projection-projects.test.ts`
  - `extensions/memory-middleware/src/native-memory-projection-audit.ts`
  - `extensions/memory-middleware/src/native-memory-projection-audit.test.ts`
  - `scripts/memory-native-sync.ts`
  - `docs/memory-system/CURRENT_SLICE.md`
  - `docs/memory-system/DECISIONS.md`
  - `docs/memory-system/README.md`
  - `docs/memory-system/STATUS.md`
- follow-on repo reds discovered during validation were fixed:
  - `ui/src/ui/app-render.helpers.ts`
    - grouped and named subagent sessions remain visible in the chat selector
      where appropriate
    - custom agent group labels include the agent id for stable disambiguation
  - `ui/src/ui/views/sessions.test.ts`
    - stale hidden-session fixture was updated to use real visible session keys

Completed in the workspace repo:

- `projects/ops/memory_projection_report.sh`
  - new host-side projection report and sync wrapper
- `projects/ops/daily_operator_review_prep.sh`
  - includes projection summary in the daily operator review prep context
- `projects/ops/INDEX.md`
  - documents the new projection report helper and generated-current artifacts
- `runbooks/openclaw_runbook.md`
  - documents the manual and scheduled projection refresh path
- projected shared workspace files were updated in-place by the new compiler:
  - `USER.md`
  - `TOOLS.md`
  - `MEMORY.md`

Live state already changed outside git:

- host cron now includes a scheduled memory projection refresh before
  `daily_operator_review_prep.sh`
- checkpoint backup exists at
  `/root/backups/memory-projection-checkpoint-2026-04-10T1033Z`

## Validation Already Completed

Validated on the paused feature tree:

- targeted provider/plugin tests passed
- targeted native-memory projection tests passed
- targeted UI session/chat tests passed
- `pnpm check:fast` passed
- `pnpm check:types` passed
- `pnpm build` passed
- `pnpm test` passed on this host under the constrained safe-mode profile
- manual/native memory sync summary proof passed
- repeated host-side projection sync runs proved idempotent after the first
  write

## Remaining Closeout Work

Remaining before feature closeout:

1. Finish the landing/build/runtime-proof diagnosis/spec pass.
2. Resume the paused feature closeout from this exact tree.
3. Review the final engineering repo diff and stage only the intended feature
   files.
4. Review the final workspace repo diff and stage only the intended feature
   files.
5. Create scoped engineering repo commit(s).
6. Create a scoped workspace repo commit.
7. Push the engineering repo to the writable remote.
8. Push the workspace repo.
9. Write the full feature implementation report.

## Current Repo State

Engineering repo branch:

- `codex/land-main-session-and-browser-fixes`

Engineering repo feature-scope files:

- `src/plugins/providers.test.ts`
- `test/vitest-config.test.ts`
- `ui/src/ui/app-render.helpers.ts`
- `ui/src/ui/views/sessions.test.ts`
- `extensions/memory-middleware/src/native-memory-projection-routing.ts`
- `extensions/memory-middleware/src/native-memory-projection-routing.test.ts`
- `extensions/memory-middleware/src/native-memory-projection-projects.ts`
- `extensions/memory-middleware/src/native-memory-projection-projects.test.ts`
- `extensions/memory-middleware/src/native-memory-projection-audit.ts`
- `extensions/memory-middleware/src/native-memory-projection-audit.test.ts`
- `scripts/memory-native-sync.ts`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/README.md`
- `docs/memory-system/STATUS.md`

Engineering repo staged state left by the interrupted commit attempt:

- staged:
  - `src/plugins/providers.test.ts`
  - `ui/src/ui/views/sessions.test.ts`
- unstaged changes still exist for the broader feature tree

Engineering repo unrelated dirt to avoid:

- `docs/help/slice-workflow.md`
- `docs/help/testing.md`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`
- `package.json`
- `scripts/memory-rollout-eval.ts`
- `scripts/run-gate.mjs`
- `scripts/runtime-postbuild.mjs`
- `scripts/stage-bundled-plugin-runtime.mjs`
- `scripts/test-parallel.mjs`
- `tsconfig.plugin-sdk.dts.json`
- untracked helper/build files:
  - `scripts/heavy-task-status.mjs`
  - `scripts/lib/build-fingerprint.mjs`
  - `scripts/lib/repo-heavy-task.mjs`
  - `scripts/plugin-sdk-dts-build.mjs`
  - `tsconfig.typecheck.core.json`
  - `tsconfig.typecheck.plugin-sdk.json`

Workspace repo branch:

- `main`

Workspace repo feature-scope files:

- `USER.md`
- `TOOLS.md`
- `MEMORY.md`
- `projects/ops/memory_projection_report.sh`
- `projects/ops/daily_operator_review_prep.sh`
- `projects/ops/INDEX.md`
- `runbooks/openclaw_runbook.md`

Workspace repo unrelated dirt to avoid:

- `AGENTS.md`
- `archives/daily_memory_evidence/2026-04-10.md`
- `archives/memory_performance_reports/2026-04-05.md`
- `core/INDEX.md`
- `core/WORKSPACE_STRUCTURE.md`
- `projects/github/github_digest_telegram.sh`
- `projects/ops/memory_performance_report.sh`
- `projects/ops/memory_soak_db_report.sh`
- `runbooks/INDEX.md`
- `runbooks/webhook_gateway_runbook.md`
- `scripts/INDEX.md`
- the large set of untracked archives/imports/runtime artifacts currently in the
  workspace tree

## Known Blockers

Current blockers:

- no functional blocker remains on the paused feature tree
- the closeout is intentionally paused pending the landing/build/runtime-proof
  workflow diagnosis and proposal

## Exact Resume Action

When this diagnosis/spec pass is accepted, resume from this state by:

1. deciding whether to implement the workflow improvements first or return
   directly to feature closeout
2. if returning directly to feature closeout:
   - do not re-implement feature code
   - re-run only the gates invalidated by any new doc/spec edits
   - finish the scoped commits and pushes for the already-complete feature work
