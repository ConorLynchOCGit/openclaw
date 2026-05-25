# Expansion Controller And Dynamic Fanout Admission

Execute this queue item in the local Codex session, not through OpenClaw proof submission.

## Queue Item

`openclaw-convergence.expansion-controller-dynamic-fanout-admission`

## Source Specs

- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`
- `docs/projects/execution-platform/specs/runtime-work-graph.md`
- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`
- `docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`
- `docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md`

## Objective

Implement a first-class runtime expansion controller for generic workflow graphs. The scheduler must no longer accept arbitrary graph expansion volume just because the orchestrator produced valid node JSON. Runtime must decide whether graph growth is admissible, paged, deferred behind a ready frontier, rejected for budget, or halted as no progress.

The controller must make graph expansion safer without adding semantic forest logic. The model decides work intent and semantic decomposition. Runtime owns budgets, paging, refs, lifecycle, progress emission, and bounded persistence.

## Required Implementation

1. Add a canonical expansion admission module.
   - Define `ExpansionAdmissionDecision` with statuses:
     - `accepted`
     - `accepted_paged`
     - `deferred_due_to_ready_frontier`
     - `rejected_budget_exceeded`
     - `halt_no_progress`
     - `needs_review`
   - Include policy, counts, admitted/deferred node ids, admitted/deferred edge ids, ready-frontier ids, reason codes, and raw-storage false flags.
   - Add configurable policy with conservative defaults:
     - max new nodes per iteration
     - max new edges per iteration
     - max absolute node/edge additions before needs-review
     - max active/pending context requests
     - max active implementation/resource branches
     - max graph patch bytes where available
   - Runtime may page by count/refs, but must not drop bodies into scheduler progress.

2. Wire admission into `RuntimeWorkGraphScheduler.applyDecision`.
   - Evaluate admission before staged graph persistence.
   - If ready executable frontier exists and expansion is not prerequisite-critical, defer expansion and return `continue` so the next scheduler loop executes the frontier.
   - If the decision is too large but within absolute bounds, persist only the admitted page and record deferred counts/ids in bounded progress/checkpoint evidence.
   - If outside absolute bounds, terminalize as `needs_review` with precise budget reason codes.
   - Never silently raise limits and never store full deferred node bodies in metadata.

3. Add scheduler runtime tool/readback coverage.
   - Add `scheduler.evaluate_expansion_admission`.
   - Emit admission state in scheduler progress, latest-run-state, and Work Queue active graph readback.
   - Readback should show status, admitted/deferred counts, sampled ids, ready frontier ids, policy ref, next transition, and reason codes.

4. Preserve generic orchestration semantics.
   - No Product/Spec-only rules.
   - No deterministic semantic judgement about whether a node is useful.
   - Prerequisite-critical expansion is a runtime-bound structural category based on dependency/readiness state, not prompt text.
   - Runtime can enforce fanout shape constraints such as "context request has no consumer edge" without judging semantic quality.

5. Add focused tests.
   - Large graph add-node decision is admitted as a bounded page.
   - Decision above absolute bounds returns needs-review before graph persistence.
   - Ready executable frontier causes non-prerequisite expansion deferral.
   - Admission tool is registered and emits raw-storage-safe traces.
   - Work Queue/readback surfaces expansion admission state.
   - Scheduler still executes a ready frontier before asking for/accepting more graph expansion.

6. Update docs and queue lifecycle.
   - Update status/current-slice/roadmap/specs with implementation evidence.
   - Record a bounded closeout artifact.
   - Close the DB Work Queue item only with validation evidence and set the next active item to Superstep Frontier Runtime And Branch Results.

## Constraints

- No compatibility/fallback graph-injection path.
- No Product/Spec-specific shortcut.
- No full node/edge body storage in scheduler progress or graph metadata.
- No raw prompt, raw response, raw provider log, raw tool log, raw command log, raw DB rows, or secrets storage.
- No semantic regex/keyword gating.
- No arbitrary truncation of meaningful model context.
- No implementation execution without canonical node readiness.

## Validation

Run focused tests and scoped type validation:

- `pnpm test:file` for new expansion-admission tests, scheduler runtime tool tests, runtime work graph scheduler tests, and Work Queue readback tests touched by the patch.
- `pnpm tsgo:fast --` for changed TS files.

If full repo validation is blocked by pre-existing unrelated failures, record the exact blocker and focused validation evidence.

## Deep Completion Question

After implementation and validation, perform code review before answering:

> Did we maximally execute and implement Expansion Controller And Dynamic Fanout Admission? Is expansion admission canonical, generic across workflows, fully wired into production scheduler persistence, runtime-tool traces, latest-run-state, and owner-facing Work Queue readback? Does it prevent unbounded graph growth without semantic prompt heuristics, preserve ready-frontier execution, page large graph additions safely, and halt exact budget violations with actionable diagnostics? Are there compatibility/fallback/dead-code paths that can still bypass expansion admission before graph persistence? Is anything proof-shaped instead of live-wired?

If the answer is not an unqualified yes, implement the missing hardening, rerun validation, update docs/artifacts/Work Queue, and repeat the question.
