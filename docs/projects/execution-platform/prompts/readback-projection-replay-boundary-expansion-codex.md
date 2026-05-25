# Readback Projection And Replay Boundary Expansion

You are Codex working directly in the OpenClaw repository. Implement the next pre-proof queue item:

`openclaw-convergence.readback-projection-replay-boundary-expansion`

Read and follow the relevant specs before editing:

- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`
- `docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md`
- `docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`
- `docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`
- `docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md`

## Objective

Make replay boundaries and owner readback first-class production contracts over the new GraphPatch, Context Broker, Expansion Admission, Resource Materialization, and Superstep Frontier runtime objects. This must not be a Product/Spec-only proof wrapper. It must be a reusable execution-platform capability for future coding, planning, research, docs, QA, design, marketing, memory, proactivity, validation, human-task, and closeout workflows.

## Required Implementation

1. Expand the canonical boundary replay checkpoint contract.
   - Add granular boundary kinds for context request/handoff, context synthesis, expansion admission, graph patch write, resource materialization, worker invocation/edit, validation, and closeout.
   - Preserve existing coarse boundary kinds as canonical compatibility checkpoints for already-live runtime records, but do not introduce a second replay truth source.
   - Replace brittle linear "all previous enum values are required" planning with an explicit runtime-owned boundary dependency contract.
   - Required upstream checkpoints must be deterministic structural dependencies, not prompt semantics or filename keywords.

2. Make resource materialization checkpoints first-class.
   - Record `before_resource_materialization` before resource packet compilation for implementation/test/repair nodes.
   - Record `after_resource_materialization` after `NodeExecutionPacket`, domain resource packet, and `NodeReadinessState` refs are attached.
   - If materialization blocks, the checkpoint must still be replayable as `repair_boundary` when it has accepted readiness/resource refs.
   - Do not store full packets, file snapshots, raw prompt text, raw model output, raw provider logs, raw tool logs, raw command logs, raw DB rows, secrets, or hidden reasoning in checkpoint metadata.

3. Make latest-run-state boundary-aware.
   - `buildLatestRunState(...)` must expose compact boundary replay state:
     - latest checkpoint kind;
     - checkpoint refs;
     - graph checkpoint refs;
     - plan/continuation refs where present;
     - replay policies/statuses;
     - current replay boundary;
     - next legal replay boundary/transition;
     - reason codes.
   - Latest-run-state remains bounded, manifest-only, non-secret, and readback-only.

4. Make Work Queue readback projection use compact boundary state.
   - Owner readback must project boundary replay status from compact latest-run-state and explicit boundary events/artifacts.
   - It must show current boundary, accepted checkpoint, rejected/stale refs, exact continuation action, resume artifact refs, active node ids, branch blockers, readiness refs, and next transition.
   - Readback must not require scanning hundreds/thousands of artifact bodies on the hot path.

5. Wire replay scripts through the canonical service.
   - The Product/Spec boundary replay harness must attach canonical `execution.boundary_replay_checkpoint` artifacts for resource materialization boundaries instead of only graph checkpoints.
   - The harness must emit compact latest-run-state compatible fields at every boundary event.
   - It must prove no upstream rerun flags are set when replaying from resource-materialization or graph-patch boundaries.

6. Add regression tests and a lane proof.
   - Boundary replay service tests for new boundary kinds and dependency planning.
   - Dynamic runner tests or focused unit tests proving resource materialization records before/after checkpoints.
   - Latest-run-state tests for boundary projection.
   - Work Queue readback tests for current boundary, continuation action, and compact replay refs.
   - Replay harness/lane proof that uses resource-materialization boundary inputs and does not rerun Mission Ledger, packet authoring, context scouts, or graph selection.

7. Update docs, Work Queue evidence, and closeout.
   - Update the relevant specs/status/current-slice/roadmap.
   - Record closeout evidence for `openclaw-convergence.readback-projection-replay-boundary-expansion`.
   - Move the Product/Spec proof item to the next active pre-proof item only after validation passes.

## Non-Negotiable Boundaries

- Runtime owns schema, refs, bounds, storage, authority, lifecycle, replay identity, and continuation gates.
- Models own semantic judgment, not replay checkpoint schema.
- Do not add regex/keyword semantic routing.
- Do not add Product/Spec-only shortcuts.
- Do not widen metadata limits to hide body storage mistakes.
- Do not create fallback/compatibility success paths that can bypass boundary replay validation.
- Do not store raw prompt/model/provider/tool/command/DB bodies in readback/checkpoint metadata.

## Validation

Run focused validation first:

```bash
pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts
```

Then run scoped type validation over touched files:

```bash
pnpm tsgo:fast -- extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs
```

If validation fails, diagnose and fix the underlying production contract. Do not weaken tests to pass.

## Deep Completion Question

After implementation and validation, perform code review and answer:

Did we maximally execute and implement Readback Projection And Replay Boundary Expansion? Are replay boundaries canonical production objects, fully wired into scheduler/runtime/resource materialization/readback/replay harness paths, bounded by payload/manifest storage rules, visible in owner-facing Work Queue/latest-run-state readback, and unable to fake production success or rerun expensive upstream phases silently? Is there any way to improve, harden, optimize, sharpen, extend, or remove fallback/compatibility/dead-code surfaces before the Product/Spec proof? Is anything still proof-shaped instead of live-wired?

If the answer is not an unqualified yes, implement the missing hardening immediately, rerun focused validation, update docs/artifacts/Work Queue, and repeat.
