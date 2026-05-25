# Superstep Frontier Runtime And Branch Results

Execute this queue item in the local Codex session, not through OpenClaw proof submission.

## Queue Item

`openclaw-convergence.superstep-frontier-runtime-branch-results`

## Source Specs

- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`
- `docs/projects/execution-platform/specs/runtime-work-graph.md`
- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`
- `docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`
- `docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md`

## Objective

Promote the existing parallel frontier runner into a first-class superstep branch-result contract. The scheduler must execute independent ready nodes in bounded parallel supersteps, preserve sibling evidence when one branch fails, classify each branch outcome into canonical runtime statuses, and expose branch blockers/next transitions in owner-facing readback.

This is a generic orchestration runtime feature. Do not add Product/Spec-specific behavior.

## Required Implementation

1. Add or harden a canonical superstep branch-result contract.
   - Supported statuses:
     - `succeeded`
     - `blocked_context`
     - `blocked_resource`
     - `blocked_dependency`
     - `blocked_authority`
     - `blocked_human_decision`
     - `failed_recoverable`
     - `failed_unrecoverable`
     - `needs_review`
   - Include superstep id, branch id, node id/kind, capability id, target commitments, status, failure class, schema/error path, blocker summary, repair action, next transition, evidence refs, readiness state ref, reason codes, and raw-storage false flags.
   - Runtime classifies from node result status, readiness metadata, reason codes, and lifecycle state. It must not judge semantic sufficiency.

2. Wire the contract into `RuntimeWorkGraphScheduler.tryRunParallelRunnableFrontier`.
   - Branch success/failure must be recorded as canonical branch results, not just raw node statuses.
   - A branch exception must update only that branch/node and return a branch result.
   - Sibling branch evidence and succeeded statuses must survive a failed sibling.
   - Systemic repeated branch failures across siblings must halt as `needs_review` with one root cause.
   - Non-systemic branch failures must return to orchestrator/context/resource repair without discarding successful sibling evidence.

3. Add scheduler runtime tool coverage.
   - Add `scheduler.open_superstep_frontier`, `scheduler.record_superstep_branch_result`, and `scheduler.join_superstep_frontier`.
   - Emit bounded runtime tool traces for selection/open, branch result recording, and join/close of the superstep.
   - Do not record raw provider output, raw prompts, raw tool logs, command logs, or full branch bodies in metadata.

4. Upgrade owner readback and latest-run-state.
   - Work Queue active graph readback must show branch id, node id, canonical branch status, blocker summary, schema path, readiness ref, next transition, evidence refs, and reason codes.
   - LatestRunState branch states should prefer canonical branch results when present.
   - Readback must stay compact and payload/ref oriented.

5. Preserve scheduler/execution policy.
   - Keep dependency, lock, provider concurrency, and max parallelism enforcement.
   - Do not automatically rerun `needs_review` nodes without orchestrator/repair authorization.
   - Do not let a branch with blocking context/resource/authority/human-decision state execute file edits.
   - Do not use semantic regex gates. Runtime classification may only use structured statuses, lifecycle fields, reason-code classes emitted by runtime, and explicit metadata refs.

6. Add focused tests.
   - Independent ready nodes execute concurrently and produce canonical `succeeded` branch results.
   - One branch exception is isolated while sibling success/evidence survives.
   - Repeated same-class branch exceptions halt as systemic `needs_review`.
   - Context/resource blocked branches classify as `blocked_context` / `blocked_resource` and expose next transitions.
   - Provider concurrency and file-lock conflict tests still pass.
   - Work Queue/readback surfaces canonical branch status/blocker/next-transition/readiness/evidence.
   - Scheduler runtime tools are registered and raw-storage-safe.

7. Update docs and queue lifecycle.
   - Update status/current-slice/roadmap/specs with implementation evidence.
   - Record a bounded closeout artifact.
   - Close the DB Work Queue item only with validation evidence and set the next active item to Readback Projection And Replay Boundary Expansion.

## Validation

Run focused tests and scoped type validation:

- `pnpm test:file` for superstep/parallel frontier scheduler tests, scheduler runtime tool tests, latest-run-state tests, and Work Queue readback tests touched by the patch.
- `pnpm tsgo:fast --` for changed TS files.

If full repo validation is blocked by unrelated pre-existing failures, record exact blockers and focused validation evidence.

## Deep Completion Question

After implementation and validation, perform code review before answering:

> Did we maximally execute and implement Superstep Frontier Runtime And Branch Results? Are branch results canonical production objects, fully wired into production scheduler execution, runtime-tool traces, latest-run-state, and owner-facing Work Queue readback? Does the scheduler execute independent ready nodes concurrently, preserve sibling evidence on branch failure, classify branch blockers without semantic prompt heuristics, and halt systemic branch failures with actionable diagnostics? Are there compatibility/fallback/dead-code paths that can still terminalize a whole frontier from one branch exception or hide branch blockers from readback? Is anything proof-shaped instead of live-wired?

If the answer is not an unqualified yes, implement missing hardening, rerun validation, update docs/artifacts/Work Queue, and repeat the question.
