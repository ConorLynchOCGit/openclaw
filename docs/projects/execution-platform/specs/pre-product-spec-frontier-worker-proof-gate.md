# Pre-Product/Spec Frontier Worker Proof Gate

Date: 2026-05-21
Last updated: 2026-05-22

Status: source-of-truth closure gate before the next full Product/Spec
Planning proof. This is not a new broad hardening lane. It is the focused
evidence pass that closes or explicitly supersedes
`openclaw-convergence.parallel-frontier-resource-boundary-hardening` and
proves that the first executable implementation frontier can actually invoke
a worker with payload-backed resources.

Work Queue item:
`openclaw-convergence.parallel-frontier-resource-boundary-hardening`.

## Purpose

The resource-materialization boundary now has durable replay checkpoints and
canonical `NodeReadinessState`. The next risk is that the system can still
look ready while failing at the parallel-frontier or first-worker boundary.

This gate exists to prove four things before the expensive Product/Spec proof:

1. parallel frontier failures isolate by branch;
2. context limitations cannot silently unlock implementation;
3. owner-facing Work Queue readback exposes the current branch/node/tool/model
   state;
4. at least one executable implementation node can receive hydrated
   `NodeExecutionPacket` input and either edit/validate/evidence successfully
   or return a precise upstream blocker.

Passing this gate does not mean Product/Spec passed. It means the next proof
can spend time on real Product/Spec implementation rather than rediscovering
generic scheduler/runtime boundary defects.

## Governing Invariants

- Graph acceptance is not execution readiness.
- Context acceptance is not resource readiness.
- `accepted_with_limitations` is not implementation-ready without an exact
  consumer-specific waiver.
- A context repair node without a consumer edge is diagnostic-only.
- A branch failure in a parallel frontier is node-level evidence, not a
  whole-job adapter collapse.
- A worker is not allowed to start unless it receives a hydratable
  `NodeExecutionPacket`, domain resource packet, file snapshots or domain
  equivalent resources, edit/authority scope, validation refs, and commitment
  mapping.
- Operator readback must show the current branch/node/tool/model/blocker
  without requiring raw artifact spelunking.

## Required Proof Lanes

### 1. Parallel Frontier Closure Lane

Run a lane proof against the latest failed graph or a semantically equivalent
fixture built from that runtime evidence.

Required assertions:

- branch failure isolation uses per-branch results and does not erase sibling
  success evidence;
- sibling evidence refs survive and remain visible in Work Queue readback;
- context repair/acquisition nodes created after a blocked node have
  `context_supplies` edges to the blocked consumer, edges through a synthesis
  barrier that supplies the consumer, or explicit diagnostic-only lifecycle;
- `accepted_with_limitations` context without an exact consumer/work-unit
  waiver cannot unlock implementation;
- Work Queue readback includes branch id, node id, node kind, capability id,
  blocker, schema path or policy path, readiness ref, and next legal
  transition.

The lane may close
`openclaw-convergence.parallel-frontier-resource-boundary-hardening` only if
the proof artifact references bounded runtime evidence and no Product/Spec
specific shortcuts.

### 2. Executable Frontier Worker Smoke

Replay from the existing `after-resource-materialization` checkpoint for
`native-exec-78e1b33861780884` or the latest equivalent checkpoint. Select one
ready implementation node from the executable frontier.

Required assertions:

- the worker receives a hydrated `NodeExecutionPacket`;
- the domain resource packet hydrates successfully;
- target file snapshots, hashes, edit scope, validation refs, target
  commitment ids, and evidence expectations are present;
- the worker makes a real bounded source edit and returns changed-file refs
  plus validation refs, or returns a precise upstream blocker before mutation;
- validation runs through the runtime validation tool path;
- evidence claims map changed files, validation, and limitations to
  commitment ids;
- changed files are reviewed by Codex or reviewer role before persistence is
  accepted as proof evidence.

If the worker fails, the result must classify the failure as one of:

- upstream context/resource blocker;
- worker tool/adapter failure;
- validation failure;
- schema/contract failure;
- model output failure;
- authority/scope failure.

It must not collapse into generic `worker_adapter_threw` without a bounded
diagnostic object.

### 3. Owner Readback Trace Gate

During the worker smoke, Work Queue/readback and latest-run-state must show:

- runtime job id;
- graph id;
- checkpoint/replay boundary;
- active superstep id and branch id when applicable;
- active node id, node kind, capability id, role class;
- current model/provider/task class;
- current tool call kind;
- current phase;
- readiness state ref;
- payload refs;
- validation state;
- blocker and next transition.

This is a hard proof gate. Post-hoc artifact inspection alone is not enough.

### 4. Context-Limitation Negative Test

Construct or replay a context handoff with:

- `status: accepted_with_limitations`;
- no matching consumer-specific waiver;
- or a waiver that points at the wrong consumer/work unit;
- or runtime-only verified refs without model-authored context substance.

The implementation frontier must remain blocked with a precise readiness
state and readback reason. It must not start a worker.

## Success Criteria

This gate passes only if all four proof lanes pass and the Work Queue item is
closed or explicitly superseded with evidence.

Required closeout evidence:

- lane proof artifact refs;
- runtime job ids and graph ids used;
- selected node ids;
- branch result summaries;
- readback evidence refs;
- validation command refs;
- changed-file refs or precise blocker refs;
- Work Queue mutation evidence;
- no raw prompts, raw responses, raw provider logs, raw command logs, raw DB
  rows, secrets, or hidden reasoning.

## Failure Semantics

If any lane fails, do not patch for that narrow case. Diagnose the boundary
that produced the symptom and fix the generic runtime/scheduler/worker
contract.

Examples:

- branch result missing means fix frontier result contract, not the fixture;
- context limitation unlock means fix readiness gate, not the prompt;
- worker missing file snapshots means fix resource materialization or
  checkpoint hydration, not the worker prompt;
- readback missing state means fix Work Queue projection/event emission, not
  artifact formatting.

## Next Step After Passing

After this gate passes:

1. run Product/Spec proof from the nearest executable frontier;
2. review implementation edits before accepting persistence;
3. rerun the full Product/Spec proof from the top after the frontier proof
   produces real source-edit progress.

## 2026-05-22 Closure Evidence

The gate was implemented and run locally by Codex before the next full
Product/Spec proof.

Evidence refs:

- runtime job: `native-exec-78e1b33861780884`;
- graph:
  `team-run-native-exec-78e1b33861780884-runtime-work-graph`;
- after-resource replay proof:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`;
- latest state:
  `.artifacts/execution-platform/latest-run-state-native-exec-78e1b33861780884.json`;
- closeout script:
  `scripts/execution-platform-record-frontier-worker-proof-gate-closeout.mjs`.

What passed:

- after-resource replay hydrated four ready frontier nodes from payload-backed
  `NodeExecutionPacket`, coding resource packet, implementation-context
  packet, and `NodeReadinessState` refs;
- `accepted_with_limitations` context now requires an exact consumer/work-unit
  waiver at both the implementation-context compiler and node-readiness
  evaluator;
- scheduler readiness accepts manifest-backed packet refs and readiness-state
  refs without storing full payload bodies in graph metadata;
- the direct worker smoke selected one existing ready implementation node
  instead of re-entering decomposition;
- Qwen/Kimi worker loop emitted model/tool/phase progress, requested extra
  context through the controller lane, applied bounded file edits, ran
  validation, and recorded commitment-linked evidence claims;
- Codex reviewed the worker-generated edits before accepting persistence.

Important issue found and fixed:

- `--execute-workers` on an `after-resource-materialization` replay originally
  re-entered graph planning and created fresh context-scout nodes instead of
  executing the existing ready frontier. The harness now has a direct
  after-resource worker-smoke branch that inspects the existing frontier,
  hydrates payloads, executes one selected ready node, and returns without
  graph-planning mutation.

Worker-quality finding:

- The worker smoke produced real edits and validation, but the first edit pass
  included low-quality changes outside the intended design shape. Codex kept
  only the production-aligned plugin/resource-readiness changes and repaired
  the malformed workflow/test edits. This confirms the worker path is usable,
  but full Product/Spec proof still requires Codex/reviewer quality review
  before source persistence is accepted.

## 2026-05-25 Worker Small-Verb Smoke Evidence

The control-plane recovery worker-smoke item supersedes the earlier frontier
worker smoke as the current pre-proof worker execution evidence.

Evidence refs:

- Work Queue item:
  `openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke`;
- runtime job: `native-exec-272cf2d51fcba75b`;
- graph: `product-spec-replay-f69b40c5defa3687`;
- boundary: `after-resource-materialization`;
- selected node:
  `g-bdd8590b57-g-bdd8590b-implementation-g0-source-spec-intake-10d0edafe5:task:1`;
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`.

What passed:

- worker invocation used a hydrated `NodeExecutionPacket`, coding resource
  packet, implementation task packet, implementation context packet, and
  `NodeReadinessState`;
- Qwen controlled context/tool selection and Kimi authored the scoped patch
  with `reasoningMode: none`;
- runtime routed a patch-lane context request through a controller/context
  subturn without giving patch lane broad authority;
- accepted edit plans normalize explicit file refs and can carry one or more
  bounded target regions;
- forced patch-author turns hydrate bounded snapshot windows for large files
  instead of sending whole files or guessing ranges from prose;
- worker applied one scoped source edit, ran structural validation, recorded
  commitment-linked evidence, and rolled the changed file back for review.

The remaining pre-full-proof gate is owner readback/telemetry proof. The full
Product/Spec proof should still review any worker-produced source changes
before persistence, but this gate has now demonstrated a real executable
source-edit worker path rather than only readiness or graph acceptance.
