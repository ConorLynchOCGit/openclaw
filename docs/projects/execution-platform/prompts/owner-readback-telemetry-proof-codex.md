# Owner Readback And Telemetry Proof

You are Codex working in `/root/services/openclaw-roles/live`.

This is the canonical execution prompt for Work Queue item
`openclaw-convergence.control-plane-07-readback-telemetry-proof`: Owner
Readback And Telemetry Proof.

This is not a generic hardening pass. Execute the maximal production-grade,
first-class, live-wired, hardened, optimized, extended version of this item
with no fallback or compatibility garbage. The goal is to prove the operator
can understand the current Product/Spec/coding-team run state from compact
runtime readback, without raw log scans, artifact spelunking, proof-only
helpers, or stale replay paths.

## Specs To Read First

Read these before changing code:

- `docs/projects/execution-platform/CURRENT_SLICE.md`
- `docs/projects/execution-platform/STATUS.md`
- `docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md`
- `docs/projects/execution-platform/specs/work-intent-control-plane-contract.md`
- `docs/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate.md`
- `docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md`
- `docs/projects/execution-platform/specs/work-queue-execution-truth.md`
- `docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`
- `docs/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch.md`
- `docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`
- `docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md`

## Mission

Prove owner-facing readback for the current WorkIntent-first execution spine.
The readback must show, from compact runtime state and Work Queue projections:

- WorkIntent id/title when present;
- execution intent and evidence mode;
- selected capability and executor;
- readiness status and readiness ref;
- runtime job id, graph id, branch/superstep id when present, node id, node
  kind, and role/worker/model refs;
- current phase and current model/tool call;
- blocker summary and schema/policy path when blocked;
- payload/artifact refs and raw-storage safety flags;
- changed-file refs, validation refs, evidence refs, and rollback/review state
  when worker execution has occurred;
- walltime by phase where available;
- measured token/cost usage by model where available;
- first-class labeled usage estimates or unavailable reasons where provider
  usage is unavailable;
- next legal transition.

The proof must use the latest accepted worker-smoke boundary evidence:

- runtime job: `native-exec-272cf2d51fcba75b`;
- graph: `product-spec-replay-f69b40c5defa3687`;
- boundary: `after-resource-materialization`;
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`.

## Required Implementation Shape

1. Inspect current readback/projection code.
   - Identify the canonical projection surfaces and latest-run-state writers.
   - Verify that Work Queue readback and latest-run-state use the same compact
     runtime facts rather than separate proof-only logic.

2. Implement or harden missing readback fields.
   - Do not add Product/Spec-specific semantic heuristics.
   - Do not infer semantic work kind from substrings.
   - Do not parse raw logs as the source of truth.
   - Runtime may derive schema/ref/bounds/lifecycle fields from existing
     packets, manifests, tool traces, readiness state, worker progress events,
     and compact artifact metadata.

3. Make usage telemetry explicit.
   - Preserve measured usage when provider/runtime supplies it.
   - Preserve labeled estimates separately from measured usage.
   - Preserve unavailable reasons separately from estimates.
   - Readback must not present estimated GPT/OpenRouter usage as measured.

4. Prove the worker-smoke state is owner-readable.
   - Use the accepted after-resource replay state.
   - Verify readback exposes active/completed node, model/tool/phase,
     readiness ref, payload refs, changed-file refs, validation refs,
     evidence refs, rollback-after-review state, walltime/usage availability,
     blocker/next transition, and raw-storage false flags.

5. Close the Work Queue item only from evidence.
   - Add a closeout artifact with validation commands, proof refs, summary,
     raw-storage false flags, and next item id
     `openclaw-convergence.active-queue-34`.
   - Mutate the DB Work Queue item to closed only after focused tests and proof
     evidence pass.

## Required Tests And Proofs

Run focused tests for every touched surface. At minimum consider:

- `extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts`
- `extensions/execution-platform/src/observability/latest-run-state.test.ts`
- `extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts`
- `extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs` against
  the accepted worker-smoke boundary when needed.
- scoped `pnpm tsgo:fast` over touched files.
- `git diff --check`.

If a test fails, diagnose the boundary. Do not patch narrowly for the fixture
if the failure indicates readback/projection divergence, stale replay logic,
semantic cheats, raw log dependence, or lifecycle confusion.

## Deep Completion Question

After implementation and validation, perform an explicit code review and ask:

Did we maximally implement Owner Readback And Telemetry Proof? Can an operator
see the current WorkIntent/node, execution intent, evidence mode, selected
capability, executor, readiness ref, active model/tool/phase, blocker, schema
or policy path, payload/evidence refs, walltime, usage availability, rollback
state, and next legal transition from compact runtime readback without raw
log scans or proof-only artifact spelunking? Is any production path still able
to hide worker progress, fake success, blur measured versus estimated usage,
or omit the next transition? Are any fallback, compatibility, proof-only,
Product/Spec-specific, semantic-substring, or raw-log readback paths still
active?

If the answer is not an unqualified yes:

- implement the missing hardening;
- rerun focused validation;
- rerun the relevant replay/readback proof;
- update docs and closeout evidence;
- ask the question again.

## Final Report

Report:

- files changed;
- readback fields added or proven;
- usage telemetry measured/estimated/unavailable handling;
- proof artifact refs;
- validation commands and results;
- DB Work Queue closeout status;
- remaining item before Product/Spec proof;
- any residual risk or follow-up.
