# OpenClaw Prompt: Pre-Product/Spec Frontier Worker Proof Gate

You are running inside OpenClaw against the local repository. Execute this as
a production-grade implementation and proof pass, not as a proof-shaped
fixture patch. The goal is to close or explicitly supersede
`openclaw-convergence.parallel-frontier-resource-boundary-hardening` with
bounded runtime evidence before the Product/Spec Planning production proof is
counted as the next queue item.

## Source Specs

Read and follow these specs before editing:

- `docs/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate.md`
- `docs/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening.md`
- `docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`
- `docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md`
- `docs/projects/execution-platform/specs/runtime-node-readiness-transition-engine.md`
- `docs/projects/execution-platform/specs/model-task-classification-and-resource-materialization.md`
- `docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md`
- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`
- `docs/projects/execution-platform/specs/post-proof-generic-runtime-extraction.md`

The post-proof generic extraction spec is context only. Do not broaden this
pass into generic runtime extraction unless the frontier proof exposes a
blocking ownership bug that must be fixed now to make the gate truthful.

## Mission

Implement and run the frontier-worker proof gate with maximal production
fidelity:

1. Close or supersede Parallel Frontier Resource Boundary with evidence.
2. Run one executable frontier worker smoke from the after-resource checkpoint.
3. Run an owner-readback trace gate during that smoke.
4. Run a context-limitation negative test.

This pass must move the production runtime closer to a robust generic
orchestrator/scheduler. Do not add Product/Spec-specific shortcuts, prompt
heuristics, test-only success paths, or compatibility/fallback bypasses.

## Hard Architecture Rules

- Runtime truth is runtime jobs, runtime graph state, runtime tool traces,
  runtime artifacts/payloads, `NodeReadinessState`, validation refs, evidence
  claims, and Work Queue projection/readback.
- Work Queue rows do not own execution. They project runtime truth and record
  lifecycle/readback state.
- Graph acceptance is not execution readiness.
- Context acceptance is not resource readiness.
- `accepted_with_limitations` is not implementation-ready unless the exact
  consumer/work unit has a model-authored or policy-authored nonblocking
  waiver accepted by runtime.
- Context repair nodes without consumer edges must be diagnostic-only and
  cannot unlock implementation.
- Full bodies belong in the runtime payload/body store. Graph metadata and
  artifact metadata are bounded manifests only.
- Models decide semantics, sufficiency, and usefulness. Runtime owns ids,
  refs, bounds, storage, lifecycle, authority, schema construction, graph
  envelopes, and tool execution.
- Failure must become structured readiness/branch evidence, not
  `worker_adapter_threw` without a bounded diagnostic object.
- No production success path may bypass Mission Ledger evidence, runtime tool
  traces, `NodeReadinessState`, validation evidence, Work Queue readback, and
  model-authored closeout/completion review where applicable.

## Required Implementation Work

### 1. Parallel Frontier Closure Lane

Build or upgrade the lane proof against the latest failed Product/Spec graph
or a semantically equivalent checkpoint. Prefer existing runtime evidence:

- `native-exec-68321aa82d7d6146` for the original parallel frontier failure.
- `native-exec-78e1b33861780884` for the after-resource executable frontier.

The proof must assert:

- branch failures isolate cleanly into per-branch results;
- one branch exception cannot collapse the whole adapter/scheduler result;
- sibling branch success/evidence survives and remains visible;
- context repair/acquisition nodes created after blocked implementation have
  real consumer edges, barrier-to-consumer edges, or diagnostic-only lifecycle;
- `accepted_with_limitations` context without a matching consumer/work-unit
  waiver cannot unlock implementation;
- Work Queue/readback surfaces branch id, node id, node kind, capability id,
  blocker, schema path or policy path, readiness ref, active phase, and next
  legal transition.

If production code already satisfies some parts, prove them with focused
tests and runtime evidence. If it does not, patch the generic
runtime/scheduler/readback contract. Do not weaken gates just to pass the
lane.

### 2. Executable Frontier Worker Smoke

Replay from `after_resource_materialization` or the latest equivalent
checkpoint. Select exactly one ready implementation node from the executable
frontier.

Prove the worker receives:

- hydrated `NodeExecutionPacket`;
- hydrated domain resource packet;
- target file snapshots and hashes;
- explicit edit/authority scope;
- validation refs or validation discovery refs;
- target commitment ids;
- evidence expectations/claim requirements.

Then run the worker path far enough to prove one of these outcomes:

- the worker makes a real bounded source edit, validation runs through the
  runtime validation tool path, evidence claims map changed files and
  validation to commitments, and changed files are reviewed before being
  accepted as proof evidence; or
- the worker returns a precise upstream blocker before mutation, classified as
  upstream context/resource, worker tool/adapter, validation, schema/contract,
  model output, or authority/scope.

Generic `worker_adapter_threw`, missing snapshots, missing validation refs,
or missing commitment mappings are failures of this pass unless they are
converted into exact structured blocker/readiness evidence and the code is
patched so future runs behave correctly.

### 3. Owner Readback Trace Gate

During the worker smoke, prove Work Queue/readback and latest-run-state show
the live state without requiring artifact spelunking:

- runtime job id;
- graph id;
- checkpoint/replay boundary;
- active superstep id and branch id when applicable;
- active node id, node kind, capability id, role class;
- current model/provider/task class;
- current runtime tool call kind;
- current phase;
- readiness state ref;
- payload refs;
- validation state;
- blocker;
- next transition;
- compact owner-facing ELI5/summary.

If the data is present only in raw artifacts or hidden tool rows but not
owner-facing readback, patch the readback projection. Do not count post-hoc
artifact inspection alone as a pass.

### 4. Context-Limitation Negative Test

Add or upgrade tests that feed context handoffs with:

- `status: accepted_with_limitations`;
- no matching consumer-specific waiver;
- a waiver for the wrong consumer/work unit;
- runtime-supplied verified refs without model-authored context substance.

Implementation must remain blocked with a precise `NodeReadinessState`,
policy/schema path, blocker, and next transition. It must not start a worker.

## Queue And Closeout Work

Update canonical docs and Work Queue state only after evidence exists:

- If all proof lanes pass, close or explicitly supersede
  `openclaw-convergence.parallel-frontier-resource-boundary-hardening` with
  evidence refs.
- Keep `openclaw-convergence.active-queue-34` as the next Product/Spec proof
  item.
- Do not mark Product/Spec complete in this pass.
- Record bounded artifacts under `.artifacts/execution-platform/`.
- Do not store raw prompts, raw provider responses, raw transcripts, raw tool
  logs, raw command logs, raw DB rows, secrets, or hidden reasoning.
- Update status/current-slice/roadmap/spec docs if implementation changes the
  architecture or proof outcome.

## Required Validation

Run focused tests that cover each boundary you touch. At minimum, cover:

- parallel branch failure isolation and sibling evidence survival;
- context repair consumer edge or diagnostic-only lifecycle;
- accepted-with-limitations context negative gate;
- Work Queue/readback active branch/node/readiness projection;
- executable frontier worker smoke or precise upstream blocker;
- changed-file review before proof acceptance if the worker edits.

Run scoped type validation for touched files. If a full repo typecheck is too
large for the current lane, use the canonical scoped `tsgo:fast` path and
record the validation caveat. Do not hide a TypeScript failure that affects
production runtime code.

## Deep Completion Question

After the implementation and proof lanes finish, do not answer from memory.
Review the changed code, tests, proof artifacts, queue metadata, and readback
paths. Then ask:

Did we maximally execute and implement the Pre-Product/Spec Frontier Worker
Proof Gate? Did we close or supersede Parallel Frontier Resource Boundary
with real bounded evidence? Are branch isolation, context-limitation blocking,
owner readback, hydrated worker input, validation, evidence claims, and
changed-file review canonical production behaviors rather than proof-shaped
fixtures? Is anything still bypassable through fallback, compatibility,
diagnostic-only, generic queued-runner, degraded closeout, or artifact-only
readback paths? Is there any way to improve, harden, optimize, sharpen,
extend, or otherwise make this stronger before Product/Spec Planning?

If the answer is not an unqualified yes:

- identify the exact missing production behavior;
- implement the missing hardening immediately;
- rerun focused validation and the relevant proof lane;
- update docs/artifacts/Work Queue;
- repeat the completion question.

Stop only when the gate is production-grade or when a real external
owner-only credential/configuration blocker remains. If blocked externally,
complete every non-blocked code, test, doc, queue, and artifact update and
record the exact blocker.
