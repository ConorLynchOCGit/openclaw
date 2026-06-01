---
summary: "Codex implementation prompt for Executable Spine 02: ResourceRequirement Compiler And Structural Resharding."
title: "Executable Spine 02 ResourceRequirement Compiler And Structural Resharding Codex Prompt"
---

# Executable Spine 02: ResourceRequirement Compiler And Structural Resharding

You are Codex working in the OpenClaw Execution Platform repository. Implement
`openclaw-convergence.executable-spine-02-resource-requirement-reshard` as the
second gate of the Control-Plane Executable Spine Recovery tranche.

This is not a context-scout prompt tweak. Build the production-grade,
first-class, live-wired, maximally hardened and maximally toolified context
requirement boundary that turns accepted WorkIntents into consumer-bound
`ResourceRequirementPacket`s, compiles context scout execution packets from
those requirements, and performs deterministic structural resharding when
exact provider preflight blocks a packet. No fallback paths. No compatibility
glue. No semantic truncation. No Product/Spec shortcuts.

## Read First

Read these before editing:

- `docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md`
- `docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md`
- `docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md`
- `docs/projects/execution-platform/specs/work-intent-control-plane-contract.md`
- `docs/projects/execution-platform/specs/maximum-toolification-architecture.md`
- `docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md`
- `docs/projects/execution-platform/DECISIONS.md`
- `docs/projects/execution-platform/STATUS.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`

Also inspect the current implementation before patching:

- `extensions/execution-platform/src/workflows/resource-requirement-packet.ts`
- `extensions/execution-platform/src/workflows/context-scout-execution-packet.ts`
- `extensions/execution-platform/src/workflows/context-broker.ts`
- `extensions/execution-platform/src/workflows/work-intent.ts`
- `extensions/execution-platform/src/workflows/work-intent-context-resolution.ts`
- `extensions/execution-platform/src/workflows/context-repair-requirement.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
- `extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts`
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- `extensions/execution-platform/src/work-queue/projections/*`
- `extensions/execution-platform/src/observability/*`
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `scripts/execution-platform-run-product-spec-checkpointed-test.mjs`

Use the DB-backed queue as runtime truth:

- work item:
  `openclaw-convergence.executable-spine-02-resource-requirement-reshard`
- current DB rank: immediately after
  `openclaw-convergence.scheduler-workintent-graph-demand-context-gate`
- next item after completion:
  `openclaw-convergence.executable-spine-03-node-packet-hydration-gate`

## Non-Negotiable Architecture

The valid spine is:

```text
Commitment Work Packets
  -> accepted WorkIntentGraph
  -> capability validation
  -> ResourceRequirementPacket
  -> ContextScoutExecutionPacket
  -> exact provider input preflight
  -> structural reshard if needed
  -> scoped context scout execution
  -> context handoff merge / partial handoff lifecycle
  -> downstream context readiness
```

This item owns:

```text
accepted WorkIntent/capability state
  -> ResourceRequirementPacket
  -> ContextScoutExecutionPacket
  -> provider preflight
  -> structural reshard / single-unit blocker
  -> context handoff merge or partial handoff lifecycle
```

It does not own `NodeExecutionPacket` hydration or worker execution. Leave
precise refs, artifacts, lifecycle state, and next legal transitions for the
next item.

## Deterministic / Model Boundary

Runtime may validate and compile:

- schema presence and registered enum membership;
- WorkIntent refs, hashes, ids, graph ids, branch ids, consumer node ids;
- capability manifest conformance already accepted upstream;
- context requirement consumer edges;
- payload refs, hashes, byte counts, epochs, storage flags;
- provider profile bounds, timeout bounds, parser mode, model task class;
- structural reshard unit membership and lossless unit coverage;
- graph/readback lifecycle and next legal transition;
- artifact persistence and bounded manifests.

Runtime must not judge or infer:

- semantic work quality;
- context sufficiency quality;
- target file relevance;
- model rationale persuasiveness;
- Product/Spec meaning;
- edit design quality;
- commitment closure quality.

Runtime must not use deterministic substring classifiers, semantic forests,
keyword scoring, Product/Spec-specific checks, filename heuristics, artifact
name heuristics, or model-rationale heuristics. Models or humans judge
semantic sufficiency later. Runtime preserves declared semantic fields and
validates their structural presence.

## Required Implementation

### 1. ResourceRequirementPacket Compiler From Accepted WorkIntent State

Create or harden the production compiler that turns accepted non-runnable
WorkIntent state into payload-backed `ResourceRequirementPacket`s.

The compiler must require:

- `resourceRequirementId`;
- `resourceRequirementRef`;
- `resourceRequirementHash`;
- `runtimeJobId`;
- `workflowId`;
- `graphId`;
- `consumerBranchId`;
- `consumerNodeId`;
- `workIntentRef`;
- `sourceCommitmentIds`;
- model-authored context purpose or context questions from the WorkIntent;
- required context kinds from resource/capability requirements;
- candidate source refs and repo refs from declared packet/WorkIntent/context
  broker fields;
- known target refs and validation-need refs when already declared;
- downstream capability id;
- downstream execution intent;
- downstream evidence mode;
- acceptance contract;
- limitation policy;
- provider profile ref / model task class;
- max scout input bytes and max timeout;
- allowed tool ids/families;
- repair policy and next legal transitions;
- all raw-storage flags false.

If a required semantic field is missing, do not invent it. Emit a
field-specific repair diagnostic and legal transition such as
`scheduler.context.requirement.request_revision`.

If a field is runtime-owned, compile it deterministically from manifest state,
payload refs, or accepted WorkIntent/graph state. Store payload bodies through
artifact/payload mechanisms. Graph metadata must contain only manifest refs,
hashes, counts, small summaries, status, reason codes, and next transitions.

### 2. Canonical Small-Verb Context Requirement Tools

Expose or consolidate these model-facing/runtime-tool ids as first-class
small verbs:

- `scheduler.context.requirement.create`
- `scheduler.context.requirement.attach_consumer`
- `scheduler.context.requirement.select_candidate_refs`
- `scheduler.context.requirement.compile_scout_packet`
- `scheduler.context.requirement.reject_orphan_scout`
- `scheduler.context.requirement.request_revision`

The tools must be narrow and typed. They must not expose a broad
`update_graph_json` or `submit_complex_result` surface to models. Runtime owns
the envelope and lifecycle; models choose declared semantic fields only inside
the small tool contract.

If nearby old tools exist, consolidate production progress/readback to these
canonical ids. Do not keep stale production aliases merely for legacy proof
fixtures. If a compatibility alias is temporarily unavoidable, it must be
internal-only, explicit, documented as diagnostic/deprecated, and must not be
model-facing.

### 3. ContextScoutExecutionPacket Compiler

Compile context scouts only from one or more `ResourceRequirementPacket`s.

The packet must include:

- target node ids;
- target commitment ids;
- context requirement refs and hashes;
- requirement summaries;
- consumer node/branch ids;
- work intent refs;
- context broker request refs when present;
- commitment packet refs;
- source prompt index/excerpt refs;
- bounded repo context refs;
- candidate file refs;
- validation command refs;
- requested output shape;
- model task class;
- model policy ref;
- provider timeout;
- max input bytes;
- exact provider input bytes;
- exact preflight result;
- status and reason codes;
- all raw-storage flags false.

Reject `context_scout` execution packets without at least one valid
`ResourceRequirementPacket`. Reject mixed consumers/capabilities/purposes unless
there is an explicit workflow coordination policy that marks the node
non-unlocking. Context scouts cannot be default graph glue.

### 4. Exact Provider Preflight As A Mandatory Gate

Before any context-scout provider/model call:

- build the exact model-facing prompt/input from the
  `ContextScoutExecutionPacket`;
- measure exact provider input bytes including envelope reserve;
- compare against the selected provider/model profile;
- compare requested timeout against profile max;
- emit bounded diagnostics with:
  - model task class;
  - model policy ref;
  - provider path;
  - parser mode;
  - response format mode;
  - reasoning mode;
  - input bytes;
  - max input bytes;
  - timeout;
  - max timeout;
  - envelope reserve;
  - blocking reason;
  - reason codes;
  - raw-storage false flags.

If preflight passes, the scout may run. If preflight fails, the provider must
not be invoked and the runtime must transition to structural resharding or a
precise single-unit blocker.

### 5. Lossless Structural Resharding

When preflight blocks because the packet is over provider bounds, runtime must
not truncate, semantically compact, summarize, rank, drop, or rewrite content.
It must structurally reshard by already-declared units.

Allowed sharding dimensions:

- context requirement ref;
- target commitment id;
- semantic question group;
- candidate source ref;
- candidate repo ref;
- bounded file window/ref;
- context broker request ref;
- source prompt section/excerpt ref;
- commitment packet ref.

Every child shard must preserve:

- parent packet ref;
- parent requirement ref(s);
- parent requirement hash(es);
- consumer WorkIntent/contract refs;
- consumer node/branch ids;
- target commitment ids subset;
- semantic question subset;
- candidate source/repo refs subset;
- required context kinds;
- resource requirement class;
- acceptance contract;
- limitation policy;
- provider profile/preflight diagnostics;
- next legal transitions;
- raw-storage false flags.

Add a structural coverage manifest proving:

- every parent requirement ref appears in exactly the expected child shard
  set;
- every parent commitment id appears in at least one child shard when it was a
  declared unit;
- every parent semantic question appears in at least one child shard;
- every parent candidate source/repo ref appears in at least one child shard,
  unless it is explicitly tied to a different declared unit;
- no child widens authority, consumer, capability, execution intent, or
  evidence mode;
- no child includes undeclared semantic content invented by runtime.

### 6. Single-Unit Over-Profile Blocker

If any single structural unit cannot fit inside the provider profile after
lossless structural split, runtime must block with a precise
`single_unit_over_profile_bound` artifact.

The blocker must include:

- parent packet ref;
- offending unit kind;
- offending unit ref/id;
- unit byte count;
- provider max bytes;
- provider timeout policy;
- consumer id;
- WorkIntent ref;
- context requirement ref;
- next legal transition;
- suggested structural remediation class, not semantic advice;
- raw-storage false flags.

Do not rescue by increasing limits, switching to GPT-5.5, truncating, or
summarizing. Model/provider routing changes belong to explicit model policy,
not hidden recovery.

### 7. Shard Execution And Handoff Merge

Add or harden the post-shard lifecycle:

- each ready shard can dispatch one scoped context scout;
- each shard produces model-authored handoff substance for its declared
  requirement/question/ref subset;
- runtime merges handoffs structurally by refs, not by semantic sufficiency;
- partial handoffs are represented explicitly and cannot unlock source-edit
  implementation unless consumer waiver policy permits;
- accepted-with-limitations handoffs require a consumer-aware limitation
  waiver before implementation/resource materialization can unlock.

Required small verbs:

- `scheduler.context.reshard_requirement`
- `scheduler.context.retry_failed_shard`
- `scheduler.context.merge_shard_handoffs`
- `scheduler.context.accept_partial_handoff`
- `scheduler.context.block_single_unit_over_profile`

The merge artifact must expose:

- parent requirement refs;
- shard packet refs;
- shard handoff refs;
- accepted handoff refs;
- limitation refs;
- missing shard refs;
- consumer node ids;
- WorkIntent refs;
- readiness/lifecycle status;
- reason codes;
- next legal transition;
- raw-storage false flags.

Semantic sufficiency review stays model/human-authored later. Runtime merge
only proves structural coverage and lifecycle.

### 8. Scheduler Integration

Live scheduler behavior must be:

```text
accepted WorkIntentGraph
  -> compile ResourceRequirementPacket(s)
  -> compile ContextScoutExecutionPacket(s)
  -> preflight
  -> run ready scouts OR structurally reshard OR block single unit
  -> merge shard handoffs / partial context lifecycle
  -> mark WorkIntent context state ready, partially_satisfied, or blocked
```

Do not let scheduler skip directly from WorkIntent to implementation or from
context scout to implementation. Do not reintroduce global context synthesis.

Scheduler progress/readback must show:

- `resource_requirement_compile`;
- context requirement ref;
- context scout packet ref;
- preflight byte count and profile bound;
- reshard status;
- shard count;
- failed shard id if any;
- single-unit blocker if any;
- consumer id;
- branch id;
- WorkIntent ref;
- next legal transition.

### 9. Replay And Proof Harness Alignment

Production and replay must share the same compiler/preflight/reshard logic.
Replay must not use proof-only topology, stale context synthesis, or old
context-first fixtures.

Add or harden replay boundaries as needed:

- after WorkIntent acceptance;
- before context requirement compile;
- after context requirement compile;
- after context handoff merge.

The completed-packets or after-WorkIntent replay for this item passes only if:

- context requirements compile from accepted WorkIntent state;
- context scout execution packets are consumer-bound;
- over-budget packets reshard structurally before provider invocation;
- single-unit over-profile blockers are exact when applicable;
- context handoff merge preserves shard/requirement/consumer refs;
- readback projects the true current gate.

### 10. Tests

Add focused tests before any expensive proof run.

Minimum coverage:

- accepted WorkIntent source-edit node compiles a
  `ResourceRequirementPacket`;
- WorkIntent missing model-authored context questions/purpose blocks with
  `scheduler.context.requirement.request_revision` instead of invented
  semantic questions;
- `context_scout` execution packet without a requirement ref is blocked;
- context scout packet with mixed consumers/capabilities/purposes is blocked
  unless explicit non-unlocking workflow coordination is present;
- exact preflight accepts packets under provider bounds;
- exact preflight blocks over-budget packets before provider invocation;
- over-budget multi-unit packet structurally reshards into child packets under
  bounds;
- structural coverage manifest proves no declared unit was dropped;
- single over-budget unit emits `single_unit_over_profile_bound`;
- timeout over profile is blocked or normalized only by registered provider
  profile policy, not by hidden model rerouting;
- shard handoff merge preserves accepted and limitation refs;
- accepted-with-limitations cannot unlock implementation without consumer
  waiver;
- Work Queue/readback first-open-gate shows context requirement/reshard state,
  not stale `resource_fulfillment` or `commitment_work_packets`;
- generic non-coding fixture proves this is domain-general;
- no-semantic-cheats guard covers this boundary.

Likely test files:

- `extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts`
- `extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts`
- `extensions/execution-platform/src/workflows/context-broker.test.ts`
- `extensions/execution-platform/src/workflows/work-intent-context-resolution.test.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts`
- `extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
- relevant replay harness tests under `extensions/execution-platform/src/codex-bridge/`

Do not weaken production policy to satisfy stale fixtures. Update or retire
fixtures that assert old context-first behavior.

## Required Documentation Updates

Update docs where implementation reality changes:

- `docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md`
- `docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md`
- `docs/projects/execution-platform/STATUS.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`
- `docs/projects/execution-platform/DECISIONS.md`
- `docs/projects/execution-platform/roadmap.md`

If implementation closes the DB work item, add a bounded closeout script and
artifact following the prior executable-spine closeout pattern. Do not mark
the DB Work Queue item closed unless implementation is live-wired,
production-path, validated, and reviewed.

## Validation

Run the smallest meaningful tests first, then broaden based on touched files.
At minimum run focused tests covering the compiler, scout packet, scheduler
tool registry, scheduler integration, and no-semantic-cheats guard.

Expected validation commands will likely include:

```bash
pnpm test:file extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts
pnpm test:file extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts
pnpm test:file extensions/execution-platform/src/workflows/context-broker.test.ts
pnpm test:file extensions/execution-platform/src/workflows/work-intent-context-resolution.test.ts
pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts
pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts
pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts
pnpm tsgo:fast
git diff --check
```

If a full proof or replay is run in this item, prefer a bounded replay from
the nearest real boundary:

```text
after WorkIntent acceptance
  or
after completed commitment packets if WorkIntent acceptance must be rebuilt
```

Do not rerun the full Product/Spec proof until this item and the downstream
NodeExecutionPacket hydration and worker canary gates pass.

## Completion Review

When implementation and validation are done, ask these deep completion
questions, perform code review, fix any issue found, and iterate until all
answers are clean.

1. Can any production or production-equivalent replay path create or dispatch a
   `context_scout` without a consumer-bound `ResourceRequirementPacket`?
2. Can an accepted WorkIntent requiring context skip directly to resource
   materialization or worker execution?
3. Can over-budget context scout input invoke a provider before exact
   preflight accepts it?
4. Can over-budget context input be truncated, semantically summarized,
   dropped, rerouted, or rescued instead of structurally resharded or precisely
   blocked?
5. Does structural resharding prove lossless coverage over requirements,
   commitments, semantic questions, candidate refs, broker refs, and bounded
   windows?
6. Does the single-unit over-profile blocker identify the exact offending unit
   and next legal transition?
7. Are shard handoffs merged structurally by refs without runtime judging
   semantic sufficiency?
8. Can accepted-with-limitations context unlock implementation without a
   consumer-aware waiver?
9. Do scheduler progress, latest-run-state, and Work Queue/readback show the
   true context requirement/preflight/reshard gate?
10. Are model-facing tool surfaces small verbs, not broad graph/state JSON
    mutation tools?
11. Are stale legacy fixtures updated or retired instead of weakening
    production policy?
12. Does a generic non-coding fixture pass, proving this is general
    orchestration infrastructure?
13. Are all raw prompt/response/provider/tool/command/DB bodies and hidden
    reasoning excluded from stored artifacts and metadata?
14. Did code review find any deterministic semantic classifiers, Product/Spec
    shortcuts, filename heuristics, fallback runners, or body-in-metadata
    leaks?

Only call this item complete if the implementation is live-wired,
production-path, covered by focused tests, and the code review finds no
remaining blocker.
