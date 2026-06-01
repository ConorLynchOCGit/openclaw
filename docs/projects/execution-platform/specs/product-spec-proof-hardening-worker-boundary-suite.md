---
summary: "Aggressive pre-proof hardening tranche after the first contract-hydrated non-Codex worker smoke: replay fidelity, target selection, context repair requirements, stale-child retirement, reviewable patch artifacts, multi-child worker smokes, and adversarial entry gates before the full Product/Spec proof."
title: "Product/Spec Proof Hardening And Worker Boundary Suite"
---

# Product/Spec Proof Hardening And Worker Boundary Suite

Date: 2026-05-25

Status: active P0 pre-Product/Spec proof tranche. This spec decomposes and
supersedes the broad `contract-spine-10-replay-proof` item into smaller
production-grade work items that must pass before the next top-to-bottom
Product/Spec proof.

## Why This Exists

The latest boundary replay finally proved the non-Codex worker lane can
execute when upstream control-plane contracts are clean:

```text
NodeExecutionContract
  -> NodeExecutionPacket
  -> CodingResourcePacket
  -> ImplementationTaskPacket
  -> worker.repo.read_files
  -> worker.edit.plan
  -> worker.patch.force_author_from_plan
  -> worker.patch.author_edit
  -> worker.validation.run_structural_default
  -> worker.evidence.claim_from_validation
  -> rollback_after_review_artifact
```

That success is important, but it is not an end-to-end proof. It proves the
lower worker lane is viable after a node is correctly hydrated, scoped,
materialized, and contract-valid. The remaining risk is now concentrated in
the control plane and proof substrate:

- replay can diverge from production;
- stale split children can remain in the graph;
- target-selection policy can name Qwen while the implementation path only
  supports Codex;
- target-selection payloads can exceed fast-lane bounds;
- context repair nodes can exist without `ResourceRequirementPacket`s;
- persisted readiness can disagree with recomputed readiness;
- rolled-back edits can be hard to review;
- a single successful worker child can hide failures on other child classes;
- proof entry can still be expensive and blind.

This tranche is intentionally aggressive. The goal is to make the next full
Product/Spec proof a composed run over already-proven boundaries, not another
expensive discovery pass.

## Can This Be Pushed Further?

The plan was pushed past "run another replay" into a proof-entry system:

1. Prove replay topology is production-faithful or explicitly diagnostic.
2. Prove target selection as a real model-task boundary with correct provider
   routing and payload budgets.
3. Prove context repair nodes have real context requirements and consumers.
4. Prove rematerialization cannot leave stale executable children.
5. Prove worker edits are reviewable after rollback.
6. Prove multiple worker child shapes, not one hand-picked node.
7. Prove adversarial negative cases before the full proof.

After that extension, the answer is black-and-white: no, this pre-proof plan
cannot be materially pushed further without becoming speculative. The next
new information must come from implementation evidence and proof results.

## Governing Architecture

The governing spine remains:

```text
Prompt
  -> Obligation Graph
  -> Commitment Work Packets
  -> WorkIntent
  -> TargetSelectionPacket
  -> ResourceRequirementPacket
  -> NodeExecutionContract
  -> NodeExecutionPacket
  -> domain resource packet
  -> worker small-verb loop
  -> validation phase result
  -> typed evidence claim
  -> review
  -> closeout
```

Graph nodes schedule. Payload-backed contracts define work. Runtime validates
schema, refs, bounds, lifecycle, locks, authority, provider/tool execution,
and readback projection. Models make bounded semantic decisions through
declared tools. Runtime must not infer execution intent, target suitability,
context sufficiency, evidence quality, or task semantic class from substring
matches, file-name heuristics, Product/Spec prose, or artifact ref names.

## Non-Semantic Structural Guardrails

This tranche must not introduce deterministic semantic judgment, semantic
forests, keyword classifiers, file-name scoring, Product/Spec-specific runtime
branches, or "looks like" heuristics.

Runtime may deterministically check only structural facts:

- whether a required payload body exists;
- whether a ref is in an allowed candidate set;
- whether hashes, epochs, schema versions, and contract refs match;
- whether a selected provider/model can execute the declared task class;
- whether an input bundle exceeds a declared byte/token budget;
- whether a node has required consumer edges;
- whether a capability manifest declares the selected capability as valid for
  the model-authored execution intent;
- whether a validation phase is compatible with the evidence claim phase;
- whether an old authority surface has been retired, superseded, or demoted
  to projection-only.

Runtime must not decide:

- whether a file is semantically relevant because of its path/name/prose;
- whether context is sufficient by reading prose and scoring quality;
- whether an edit is good;
- whether Product/Spec wording implies special scheduler behavior;
- whether a task is "too complex" in a qualitative sense;
- whether a model-authored rationale is persuasive.

Those are model/human judgment surfaces. Runtime can require that the model or
human judgment exists in the correct payload-backed contract, then validate
the surrounding structure.

## Authority Surface Retirement Gate

The previous phrase "complexity budget" is intentionally not used. It could
invite deterministic semantic judgment. The production-safe gate is:

> Any new canonical contract or runtime authority must retire, supersede, or
> demote older competing authority surfaces to projection/diagnostic-only.

The gate checks structural ownership, not semantic complexity.

For every proof-hardening item, implementation must answer:

- What field, transition, lifecycle state, or execution authority does this
  item make canonical?
- What older path could still write, decide, or unlock the same thing?
- Is the older path removed, superseded, archived, blocked by preflight, or
  explicitly projection/diagnostic-only?
- Can two active surfaces still unlock execution for the same node?
- Can two active replay paths still claim production equivalence for the same
  boundary?
- Can persisted readback still overrule recomputed readiness?
- Can graph metadata still carry body-level executable semantics?

Passing the gate means there is one active authority for each executable
field/transition. Other surfaces may remain only as projections, historical
artifacts, diagnostics, or explicit compatibility debt scheduled for removal.

## Generality Sentinel

Every proof-hardening item must include at least one generic fixture or neutral
contract path in focused tests. The item may use Product/Spec replay evidence,
but it cannot pass solely by recognizing Product/Spec node names, commitment
wording, file paths, workflow IDs, or proof prompts.

The generic fixture should use neutral workflow/domain names such as:

- `workflow.generic_resource_review`
- `domain_resource_packet`
- `resource_selection_decision`
- `action_review_artifact`
- `resource_requirement_packet`
- `node_execution_contract`

The fixture does not need to execute a real non-coding workflow end to end in
this tranche. It must prove the runtime contract is domain-shaped rather than
coding-only.

## Capability Manifest Conformance

Every executable node must be checked against a capability manifest before
worker/provider dispatch. This is structural conformance, not semantic
judgment.

Runtime validates:

- the model-authored `executionIntent` is one the selected capability declares;
- the required evidence modes are declared by the capability;
- required resource packet kinds exist;
- required validation phases are available;
- selected worker/executor is registered for the capability;
- authority scopes are compatible with the capability;
- broad fallback capability selection is rejected unless the model-authored
  rationale and manifest permit it.

Runtime does not choose a capability from node title/prose. It validates the
model-authored capability selection against the manifest.

## Relationship To Prior Contract-Spine Items

Items 01-09 established the substrate:

- `NodeExecutionContract`
- `ResourceRequirementPacket`
- demand-driven context policy
- frontier root-cause collapse
- branch-scoped frontier state
- scheduler observability envelope
- validation phase semantics
- canonical readback gate
- model-policy bindings

This spec does not replace those contracts. It proves the seams between them
under the exact failure classes that have blocked Product/Spec.

`openclaw-convergence.contract-spine-10-replay-proof` is too broad to remain
the next execution item. It is superseded by this decomposed tranche.

## 1. Replay Production Fidelity And Boundary Epochs

### Implementation Evidence, 2026-05-25

DB closeout recorded `openclaw-convergence.proof-hardening-01-replay-production-fidelity-epochs`
as closed with closeout artifact
`.artifacts/execution-platform/proof-hardening-01-replay-production-fidelity-closeout.json`.
The implemented surface includes production-equivalence replay manifests,
diagnostic-only proof-closure blocking, boundary epochs, stale-child
supersession, frontier epoch eligibility filtering, replay epoch/readback
projection, latest-run-state projection, terminal replay runtime shutdown, and
no-semantic-cheat regression coverage.

### Problem

Replay has repeatedly helped diagnose bugs while also resurrecting older
topology. The most dangerous cases are:

- replay injecting `context_synthesis` as default glue after production
  retired that behavior;
- replay running from stale checkpoints that do not have current contract
  bodies;
- replay rematerializing a parent while stale child nodes stay active;
- replay scripts printing terminal results while leaving Node handles alive.

### Required Design

Replay must be a first-class runtime boundary system, not a parallel proof
runner.

Every replay plan must declare:

- `replayBoundaryId`
- `sourceRuntimeJobId`
- `sourceGraphId`
- `productionPathEquivalence`
- `diagnosticOnly`
- `allowedSyntheticArtifacts`
- `forbiddenSyntheticArtifacts`
- `sourceCheckpointVersion`
- `normalizerRefs`
- `boundaryEpoch`
- `supersedesNodeEpochRefs`
- `terminalLifecyclePolicy`

Production-equivalent replay must use the same path as production for:

- WorkIntent compilation;
- target selection;
- context requirement compilation;
- context scout execution packet compilation;
- resource materialization;
- readiness recomputation;
- worker invocation;
- validation phase assignment;
- evidence claim generation.

Diagnostic replay may use synthetic fixtures only when:

- the replay plan declares `diagnosticOnly: true`;
- Work Queue/readback labels the result diagnostic-only;
- the result cannot close a production proof gate;
- synthetic refs are explicit and bounded.

### Boundary Epoch Rules

When a parent node is rematerialized:

- create a new `boundaryEpoch`;
- write `supersedesNodeEpochRefs`;
- retire or supersede old split children for that parent/epoch;
- prevent stale children from frontier selection;
- preserve stale children as historical artifacts only;
- readback shows current epoch and superseded child count.

No child node may be eligible if:

- its parent contract hash differs from the current parent contract hash;
- its target-selection packet ref differs from current selection;
- its implementation context packet ref differs from current context packet;
- its resource packet hash differs from current resource materialization;
- its readiness state was computed against an older contract or packet hash.

### Terminal Lifecycle Rules

Replay scripts must:

- close DB pools;
- close provider/client handles;
- stop timers/heartbeats;
- wait for runtime event flush;
- exit after terminal JSON;
- expose hanging handles in diagnostics if exit cannot complete.

### Acceptance

- A replay from completed packets produces the same topology class as
  production and does not inject `context_synthesis`.
- A replay from resource materialization retires stale children before adding
  fresh children.
- Old children remain inspectable but cannot become executable frontier nodes.
- Terminal replay scripts exit cleanly without manual `kill`.
- Work Queue readback shows replay boundary, epoch, diagnostic flag, current
  child epoch, and superseded child count.
- Authority Surface Retirement Gate: any older replay path for the same
  boundary is removed, marked diagnostic-only, or blocked from closing
  production proof gates.
- Generality Sentinel: at least one neutral non-Product/Spec replay fixture
  proves production-equivalent vs diagnostic-only behavior from declared
  boundary metadata rather than workflow names.
- No semantic judgment: replay fidelity checks boundary IDs, contracts,
  epochs, refs, synthetic flags, and topology classes only.

## 2. Resource/Target Selection Model-Task Router And Payload Budget

### Problem

Target selection is the right coding-domain specialization of a more general
resource-selection boundary, but the current path is not production-grade:

- policy says the bounded tool-selection lane can use Qwen/OpenRouter;
- replay execution uses a Codex-only JSON client;
- overriding to GPT-5.5 works but creates incoherent telemetry;
- target-selection payloads exceeded the nominal Qwen policy bound;
- runtime must not widen edit authority from broad scheduler target refs or
  context prose.

### Required Design

Resource selection becomes a first-class model-task boundary. Coding target
selection is one domain specialization:

```text
WorkIntent
  -> candidate resource handles
  -> resource-selection input bundle
  -> model-authored ResourceSelectionDecision
  -> runtime-compiled domain selection packet
  -> implementation context/resource materialization
```

For coding workflows, the domain selection packet is `TargetSelectionPacket`.
For other workflows, it may become a research-source selection packet,
approval-target packet, deployment-target packet, data-resource packet, or
another domain resource packet. The same boundary owns candidate handles,
model-authored semantic choice, runtime validation, provider routing, and
payload budget.

The model authors semantic resource/target choice:

- selected candidate refs;
- file-change intents;
- new-file intents if needed;
- validation discovery plan;
- missing context questions;
- target-selection rationale;
- blocker if target selection is impossible.

Runtime owns:

- candidate handle generation;
- schema;
- resource/target-selection packet id/ref/hash;
- validation of selected refs against candidates;
- validation against authority scope;
- validation against capability and execution intent;
- validation against WorkIntent commitment mapping;
- payload budget enforcement;
- provider routing;
- retry/repair by field.

### Provider Routing

Model-task execution must route by task class and provider profile, not by a
Codex-only helper.

Required capabilities:

- `ModelTaskClientRouter`
- provider adapter selection by `providerPath`
- exact model ref in emitted envelope;
- no contradiction between live call provider and model-task telemetry;
- preflight before provider invocation;
- response-shape diagnostics after provider return;
- bounded repair for invalid `ResourceSelectionDecision` or domain
  specialization such as `TargetSelectionDecision`.

### Payload Budgeting

Payload compaction is not semantic truncation. It must be a deterministic
handle-manifest compiler:

- preserve candidate IDs;
- preserve candidate file refs;
- preserve candidate source: scout/context/work-intent/packet;
- preserve short model-authored context summaries;
- preserve commitment IDs and exact objective snippets;
- preserve capability/evidence requirements;
- omit full file bodies unless explicitly needed;
- move large context bodies behind refs;
- include counts and hashes for omitted payloads;
- fail preflight if the handle manifest still exceeds budget.

If the Qwen lane cannot fit the resource/target-selection handle manifest:

- emit `target_selection_payload_over_budget`;
- do not silently switch to GPT and call the boundary stable;
- either shard by WorkIntent/consumer or mark the model policy as unsuitable
  for that target-selection shape.

### Acceptance

- Target selection can run through the intended provider path for Qwen or
  cleanly explain why Qwen is not eligible.
- Telemetry provider/model fields are canonical and non-contradictory.
- Payload bounds are enforced before provider calls.
- Runtime never promotes broad scheduler directory refs into executable edit
  authority without model-authored target selection.
- Field-specific repair handles missing selected refs, missing file-change
  intents, invalid candidate refs, and missing blocker rationale.
- Authority Surface Retirement Gate: broad scheduler `targetRefs`, context
  scout recommended edit points, verified refs, or graph metadata may remain
  candidates only; they cannot unlock edit authority unless converted through
  the canonical model-authored selection packet.
- Generality Sentinel: tests include a neutral `ResourceSelectionDecision`
  fixture that selects non-file domain resources from candidate handles.
- No semantic judgment: runtime validates membership, authority, capability,
  payload size, and schema only; it does not score candidate usefulness.

### Implementation Evidence - 2026-05-25

- Added generic `ResourceSelectionHandleManifest`,
  `ResourceSelectionPacket`, and `ResourceSelectionFieldRepairRequest`
  contracts. Coding `TargetSelectionPacket` is now the domain specialization,
  not the generic boundary itself.
- Added model-facing small verbs:
  `resource.selection.propose` and `resource.selection.mark_blocked`.
  Models choose resources and author
  semantic intent; runtime owns packet ids, refs, hashes, schema, payload
  bounds, provider preflight, and lifecycle.
- Added `ModelTaskClientRouter` for the resource-selection boundary. The
  replay target-selection call now binds to the `tool_selection` policy and
  `implementation_target_selection` contract boundary, with Qwen/OpenRouter
  no-reasoning profile, exact provider/model telemetry, and pre-provider
  budget/timeout/output-token checks.
- Added field-specific repair request compilation for invalid selected refs,
  missing selected refs, missing intent coverage, and parser/schema error
  paths. Repair requests name exact fields and allowed refs rather than asking
  the model to regenerate an entire graph or packet.
- Added payload artifact contracts for resource-selection packet,
  resource-selection handle manifest, resource-selection field repair request,
  and target-selection packet.
- Retired the authority bypass where direct `selectedTargetFileRefs`,
  context scout recommended edit points, verified refs, or file-change intents
  could become executable target refs without an accepted target-selection
  packet. Replay and production dynamic runner now keep those as candidates or
  evidence only.
- Validation evidence: focused resource-selection, implementation-context,
  model-task classification, runtime-artifact contract, no-semantic-cheats,
  targeted dynamic-runner resolver, replay-script syntax, scoped type, and
  `git diff --check` gates passed.

## 3. Context Repair Requirement Compiler

### Problem

Context repair nodes can be created without the same `ResourceRequirementPacket`
boundary as initial context scouts. That creates graph nodes which look real
but cannot execute as contract-valid context scouts.

### Required Design

Every context-repair node must be compiled from:

```text
failed consumer node
  -> missing readiness/resource/context fields
  -> missing semantic decision questions
  -> consumer-aware ResourceRequirementPacket
  -> ContextScoutExecutionPacket
```

The repair requirement must include:

- failed node id;
- failed branch id;
- consumer node/work intent;
- missing fields;
- blocking reason codes;
- schema/policy paths;
- accepted context refs already available;
- candidate refs already considered;
- required evidence kind;
- allowed context tools;
- maximum scope;
- whether repair is consumer-blocking or diagnostic-only;
- downstream transition if repair succeeds.

Context repair cannot be a free-form graph repair:

- model may author missing questions and target context purpose;
- runtime compiles node ids, capability, executor, edges, requirement refs,
  and consumer wiring.

### Consumer Edges

A context repair node must have one of:

- a `context_supplies` edge to the blocked consumer;
- a join/barrier edge to an explicit workflow-defined coordination node;
- `diagnosticOnly: true` with no ability to unlock implementation.

Zero-edge context repair nodes are invalid for production proof.

### Acceptance

- Context repair replay for the known failed node compiles a real
  `ResourceRequirementPacket`.
- Context repair cannot execute without a context broker request and
  requirement packet.
- Context repair output can unblock only the declared consumer.
- Diagnostic context repair remains visible but cannot satisfy readiness.
- Authority Surface Retirement Gate: graph repair, scheduler repair, and
  context scout execution cannot create production context nodes that bypass
  the `ResourceRequirementPacket` authority.
- Generality Sentinel: tests include a neutral context-repair consumer outside
  Product/Spec/coding names.
- No semantic judgment: runtime compiles missing fields, refs, consumer edges,
  and requirement packet shape; missing questions/purpose remain model-authored
  or inherited from typed failure contracts.

### Implementation Evidence, 2026-05-25

- Added the payload-backed `ContextRepairRequirementPacket` contract as the
  repair boundary above `ResourceRequirementPacket`. The packet stores the
  failed consumer, branch, WorkIntent ref, model-authored semantic questions,
  missing structural fields, schema/policy paths, accepted/candidate refs,
  lifecycle (`consumer_blocking` or `diagnostic_only`), downstream transition,
  context broker request ref, and derived context requirement ref.
- Added small-verb runtime tools for this boundary:
  `context_repair.compile_requirement`, `context_repair.link_consumer`,
  `context_repair.mark_diagnostic_only`, and
  `context_repair.block_without_requirement`.
- Scheduler-created implementation context-repair nodes now carry manifest-only
  repair requirement metadata, context broker refs, context requirement refs,
  explicit declared consumer refs, and `context_supplies` consumer edges.
  Runtime records the compile/link tools when it creates the repair nodes.
- Scheduler node execution now runs a structural context-repair gate before
  executor invocation. Production context repair blocks if the broker request,
  context requirement ref, or declared consumer edge is missing. Diagnostic
  repair remains visible but cannot unlock its consumer.
- Context scout executor paths now persist the
  `execution_platform.context_repair_requirement` payload artifact and emit the
  repair compile/link/diagnostic tools before building the scout packet. A
  blocked repair requirement cannot pass its nested requirement into
  `ContextScoutExecutionPacket`, even when lower-level schema parses.
- Runtime artifact contracts now require payload storage for
  `execution_platform.context_repair_requirement`.
- Regression coverage includes a neutral non-Product/Spec fixture proving:
  ready consumer-aware repair, blocked missing semantic questions, zero-edge
  production repair rejection, diagnostic-only non-unlocking repair, execution
  gate blocking without requirement/edge, and allowed execution only with
  requirement ref plus declared consumer edge.
- Validation evidence: focused context-repair requirement, context-scout
  execution packet, scheduler runtime tools, runtime artifact contracts,
  no-semantic-cheats, runtime-work-graph scheduler, scoped type validation,
  and `git diff --check` gates passed.

## 4. Readiness Recompute, Stale-Child Upsert, And Frontier Eligibility

### Problem

Persisted readiness can say `ready` while recomputed readiness says
`ready_with_limitations` or `blocked`. Stale split children can remain after
rematerialization and appear plausible to the frontier selector.

### Required Design

Canonical readiness is a function of:

- current `NodeExecutionContract` body/hash;
- current `NodeExecutionPacket` body/hash;
- current domain resource packet body/hash;
- current context requirement and handoff state;
- validation phase requirements;
- branch/consumer state;
- limitation waivers;
- current boundary epoch.

Persisted readiness is a projection cache. It must include:

- `computedAt`
- `contractRef`
- `contractHash`
- `nodeExecutionPacketRef`
- `nodeExecutionPacketHash`
- `resourcePacketRef`
- `resourcePacketHash`
- `boundaryEpoch`
- `staleIfMismatch: true`

Frontier eligibility uses recomputed readiness. Persisted readiness can speed
readback but cannot overrule recomputation.

### Upsert/Supersede Rules

Materialization must use deterministic child identities within a boundary
epoch, or produce a new epoch and supersede old children.

The graph repository must support:

- idempotent child upsert for same epoch/hash;
- supersede old children for new epoch/hash;
- preserve old child artifacts;
- remove old children from executable frontier;
- attach parent/child lineage refs;
- prevent duplicate task ordinals from coexisting as active siblings.

### Acceptance

- Tests prove stale children cannot be selected after rematerialization.
- Tests prove persisted `ready` cannot overrule recomputed `blocked`.
- Readback shows readiness drift explicitly.
- Resource replay creates fresh children without duplicate active stale tasks.
- Authority Surface Retirement Gate: persisted readiness is projection/cache
  only and cannot unlock execution when recomputed readiness disagrees.
- Generality Sentinel: tests cover a neutral domain resource packet in addition
  to coding resource packets.
- No semantic judgment: recomputation compares contract refs, packet refs,
  hashes, epochs, schema versions, lifecycle state, limitation waiver refs, and
  declared validation phases only.

### Implementation Evidence, 2026-05-25

- `readiness-recompute-authority` implements structural readiness
  fingerprinting, projection comparison, drift projection, and child-epoch
  frontier eligibility without Product/Spec-specific logic or semantic
  relevance scoring.
- `NodeReadinessState` persists current contract/packet/resource hashes,
  boundary epoch, computed-at timestamp, `staleIfMismatch`, projection status,
  and projection mismatch reason codes. Persisted readiness is now an owner
  readback cache; frontier execution recomputes current readiness before
  dispatch.
- Scheduler execution emits and honors small verbs:
  `node.recompute_readiness`, `node.compare_readiness_projection`,
  `node.mark_readiness_stale`, `node.upsert_child_for_epoch`,
  `node.supersede_child_epoch`, `frontier.evaluate_epoch_eligibility`,
  `frontier.block_stale_child`, and `readback.project_readiness_drift`.
- Frontier selection blocks stale child epochs, missing parent contract hashes,
  mismatched parent execution packet hashes, and mismatched parent resource
  hashes before any executor/model call.
- Work Queue active graph readback, canonical readback gates, and
  latest-run-state surface readiness projection status, drift reason codes,
  missing fields, stale flags, and next legal transition.
- Validation evidence covers readiness authority, materialization, scheduler
  runtime tools, runtime work graph, scheduler frontier execution,
  no-semantic-cheats, latest-run-state, readback projections, boundary replay,
  context broker, scoped type validation, and `git diff --check`.

## 5. Reviewable Action/Patch Artifact Spine

### Problem

The first successful worker smoke rolled back the edit correctly, but the
bounded patch body was not easy to hydrate from the printed worker result ref.
That means the system can prove "an edit happened" more easily than it can
prove "the edit was good."

### Required Design

Every action attempt that mutates or proposes durable external state must emit
a stable review artifact. Coding edits use a patch specialization:

```text
ActionReviewArtifact
  -> WorkerEditReviewArtifact
```

Required fields:

- artifact kind/version;
- runtime job id;
- graph id;
- branch id;
- node id;
- worker id;
- model refs by slot;
- task id;
- changed file refs;
- diff hash;
- bounded unified diff excerpt or payload ref;
- full bounded diff payload ref when size-safe;
- validation refs;
- evidence claim refs;
- rollback mode;
- rollback result;
- authority scope;
- target-selection packet ref;
- node execution contract ref;
- node execution packet ref;
- raw storage flags.

The artifact must be persisted whether edits are:

- applied to workspace;
- rolled back after review;
- rejected by policy;
- failed due stale patch;
- failed validation.

For non-coding workflows, the same generic pattern applies to action types
such as planning decisions, research claims, approval requests, deployment
steps, notification sends, DB operation proposals, and external API calls.
Those domains do not emit diffs, but they must emit reviewable action
summaries, payload refs/hashes, validation refs, authority scope, rollback or
compensation status, and evidence refs.

### Review Gate

A worker smoke cannot count as implementation proof unless:

- changed files are listed;
- diff hash is present;
- bounded diff/review artifact is hydrateable;
- validation refs are present or an explicit no-validation blocker exists;
- evidence claims map to commitments;
- rollback/persistence mode is explicit.

### Acceptance

- Codex/human can hydrate the review artifact by ref after rollback.
- Work Queue readback links the review artifact.
- Worker result metadata does not embed full diff bodies.
- Review validation can classify the edit as accepted, needs repair, or
  rejected without depending on workspace residue.
- Authority Surface Retirement Gate: worker result metadata, graph metadata,
  and validation metadata cannot be the only review source for a mutating
  action; the review artifact is canonical.
- Generality Sentinel: tests include a neutral `ActionReviewArtifact` fixture
  and the coding `WorkerEditReviewArtifact` specialization.
- No semantic judgment: runtime stores refs, hashes, bounded diffs/summaries,
  validation refs, rollback status, and evidence refs; model/human review
  judges quality.

## 6. Multi-Child Worker Smoke Matrix

### Problem

One successful worker child proves the worker lane is viable, not that it is
robust. The next proof should not depend on one favorable file/task shape.

### Required Design

Run a worker smoke matrix over at least three materially different
Product/Spec-derived child tasks:

1. model-task/runtime contract file;
2. workflow/plugin definition file;
3. Work Queue/readback/proof-review file.

Each smoke must use:

- current replay/production-equivalent boundary;
- current target selection packet;
- current context requirement state;
- current node execution contract;
- current node execution packet;
- current domain resource packet;
- forced patch-author boundary;
- structural validation default or targeted validation;
- evidence-from-validation;
- reviewable patch artifact;
- rollback unless explicit persistence is approved.

The smoke matrix must include both success and valid-blocker behavior. A
worker that has a hydrated packet, reads snapshots, and correctly reports that
the upstream contract is not executable is not a model failure. It is a valid
control-plane signal if the blocker is typed, payload-backed, and points to
the next legal transition.

### Pass Criteria

For each selected child:

- worker receives hydrated contract/packet/resource bodies;
- worker reads bounded snapshots;
- worker plans;
- worker either makes a scoped edit or returns precise upstream blocker;
- if edited, validation runs;
- evidence claims map to commitments;
- bounded review artifact is hydrateable;
- workspace is restored if rollback mode is used;
- no broad tool-selection drift after accepted edit plan.
- at least one matrix case intentionally exercises a precise no-edit upstream
  blocker rather than forcing a patch.

### Failure Classification

Failures are useful if they are typed:

- `upstream_context_missing`
- `target_selection_insufficient`
- `resource_packet_missing`
- `contract_incomplete`
- `worker_tool_contract_choke`
- `patch_author_no_edit`
- `validation_failed`
- `review_artifact_missing`
- `provider_no_content`
- `provider_timeout`
- `policy_denied`

Untyped `needs_review` is not acceptable for this proof gate.

### Acceptance

- At least three different materialized child classes are exercised.
- At least one smoke produces scoped edit evidence with validation, evidence
  claim, rollback/review artifact, and restored workspace.
- At least one smoke proves a precise upstream blocker path without provider
  retries or broad graph repair.
- Authority Surface Retirement Gate: workers can be invoked only through
  hydrated `NodeExecutionPacket` plus domain resource packet bodies; legacy
  adapter or replay paths cannot bypass the packet boundary.
- Generality Sentinel: tests include a neutral executor/domain resource packet
  fixture outside Product/Spec/coding names.
- No semantic judgment: runtime verifies edit/blocker structure, validation
  refs, evidence refs, rollback state, review artifact hydration, and lifecycle
  transitions. Model/human review judges semantic edit quality.

## 7. Adversarial Proof Entry Suite

### Problem

The full Product/Spec proof is expensive. It should start only after the
substrate fails correctly on known dangerous cases.

### Required Negative Tests

Before top-to-bottom proof, run a mini adversarial suite:

1. **Stale Child Replay**
   - rematerialize a parent with existing stale children;
   - prove old children are superseded and not executable.

2. **Missing Contract Body**
   - create a node packet with only a contract ref and no body;
   - prove worker dispatch blocks before provider invocation with exact
     missing payload reason.

3. **Context Repair Without Requirement**
   - create/locate a context repair node without requirement packet;
   - prove it cannot execute as production context scout;
   - prove the repair compiler can produce the missing requirement.

4. **Target Selection Over Budget**
   - feed overlarge candidate set;
   - prove preflight blocks or shards before provider call;
   - no silent model upgrade counted as clean proof.

5. **Accepted-With-Limitations Without Consumer Waiver**
   - feed limited context to implementation;
   - prove implementation blocks unless waiver is declared for exact
     consumer.

6. **Worker Edit Rollback Review**
   - make a bounded worker edit in rollback mode;
   - prove patch review artifact persists and hydrates after rollback.

7. **Sibling Branch Failure Isolation**
   - make one branch fail materialization while sibling succeeds;
   - prove sibling evidence survives and failed branch gets root-cause state.

8. **Provider Routing Contradiction**
   - attempt Qwen policy through a Codex-only path;
   - prove preflight rejects with provider-route mismatch rather than running
     with contradictory telemetry.

9. **Semantic Lexical Trap**
   - create Product/Spec-like words in unrelated node titles, file names,
     commitment ids, context summaries, and artifact refs;
   - prove deterministic behavior is unchanged unless typed contract fields,
     capability manifests, refs, hashes, or lifecycle states differ.

10. **Non-Coding Domain Fixture**
    - exercise `WorkIntent`, `ResourceSelectionDecision`,
      `ResourceRequirementPacket`, readiness, and `ActionReviewArtifact` over a
      neutral non-coding domain resource shape;
    - prove the substrate is domain-shaped rather than coding-only.

11. **Capability Manifest Default Trap**
    - omit capability or provide a capability incompatible with declared
      execution intent/resource/evidence requirements;
    - prove runtime blocks with a manifest-conformance error rather than
      defaulting to `implementation_microtask`, broad Codex, or generic
      fallback.

### Acceptance

The full Product/Spec proof may run only if the adversarial suite passes or
any failure is documented as explicitly nonblocking with owner acceptance.

The suite must assert absence of semantic cheats. Lexical traps may appear in
strings, paths, ids, and summaries, but cannot change scheduler/runtime
behavior unless model-authored typed contracts or capability manifests change.

## Full Product/Spec Proof Entry Gate

The top-to-bottom proof must not run until all are true:

- completed-packets replay produces WorkIntents without default synthesis;
- target selection runs through coherent provider routing or cleanly blocks;
- context repair compiles `ResourceRequirementPacket`s;
- resource materialization creates fresh non-stale split children;
- worker smoke matrix passes on at least three child classes or returns
  precise upstream blockers;
- reviewable patch artifacts persist and hydrate;
- readiness recomputation and readback agree or expose drift as a blocker;
- adversarial proof-entry suite passes;
- Authority Surface Retirement Gate passes for replay, target/resource
  selection, context repair, readiness, worker dispatch, validation, evidence,
  review, readback, and closeout;
- Generality Sentinel fixtures pass for the generic contract surfaces touched
  by the seven hardening items;
- Capability Manifest Conformance passes for every executable node selected
  for proof execution;
- latest-run-state can report current phase/model/provider/node/blocker/next
  action without artifact spelunking;
- no raw prompt, raw response, raw provider log, raw tool log, raw command log,
  hidden reasoning, secrets, or raw DB rows are stored.

## Work Queue Items

### `openclaw-convergence.proof-hardening-01-replay-production-fidelity-epochs`

Implement production-faithful replay boundaries, boundary epochs,
stale-child retirement, diagnostic-only labeling, and clean terminal process
shutdown.

### `openclaw-convergence.proof-hardening-02-target-selection-router-budget`

Implement first-class resource/target-selection model-task routing, coherent
provider telemetry, payload budgeting, field-specific repair, and runtime
validation against candidates/authority/capability/commitments.

### `openclaw-convergence.proof-hardening-03-context-repair-requirements`

Implement context-repair `ResourceRequirementPacket` compilation, consumer
edges, diagnostic-only rules, and context scout execution blocking when
requirements are absent.

### `openclaw-convergence.proof-hardening-04-readiness-child-upsert`

Implement readiness recompute authority, persisted readiness staleness fields,
split-child upsert/supersede semantics, and frontier eligibility against
current epoch/hash. **Closed from DB closeout evidence.**

### `openclaw-convergence.proof-hardening-05-reviewable-patch-artifacts`

Implement generic `ActionReviewArtifact` persistence plus the coding
`WorkerEditReviewArtifact` specialization, hydration, Work Queue readback,
and proof acceptance rules for rolled-back edits. **Closed from DB closeout
evidence.**

Implementation evidence:

- `ActionReviewArtifact` and `WorkerEditReviewArtifact` are first-class
  structural artifacts with raw-storage flags, refs/hashes, rollback status,
  validation refs, evidence refs, authority refs, and payload counts.
- Runtime artifact contracts require payload storage for
  `execution_platform.action_review_artifact` and
  `execution_platform.worker_edit_review_artifact`.
- The non-Codex worker loop emits a canonical worker edit review artifact ref
  when edit transactions apply, and the dynamic graph runner persists the
  payload-backed review artifact against the runtime job after worker
  execution.
- Scheduler/readback surfaces project review artifact refs alongside changed
  file refs, validation refs, evidence refs, and worker phase refs.
- Small-verb tools now cover action review creation, validation/evidence
  linking, rollback recording, hydration, worker edit review persistence, and
  review decisions.
- Tests cover neutral non-coding action review artifacts, coding worker edit
  review artifacts, contract registration, non-Codex worker artifact emission,
  scheduler tool registration, readback projection, and no-semantic-cheat
  constraints.

### `openclaw-convergence.proof-hardening-06-worker-smoke-matrix`

Run the Product/Spec-derived worker smoke matrix across at least three child
classes and require bounded edit/blocker, validation, evidence, rollback, and
review artifact evidence for each. **Closed from DB closeout evidence.**

Implementation evidence:

- Added a bounded worker-smoke matrix runner that prepares, hydrates, runs,
  records, reviews, and blocks lanes through small runtime verbs:
  `worker_smoke.prepare_matrix`, `worker_smoke.hydrate_lane`,
  `worker_smoke.run_lane`, `worker_smoke.record_result`,
  `worker_smoke.assert_review_artifact`, and
  `worker_smoke.record_blocker`.
- The proof exercises three Product/Spec-derived child classes:
  model-task/runtime contract, workflow/plugin definition, and
  Work Queue/readback/proof-review.
- The proof also exercises one valid no-edit upstream blocker and one neutral
  non-coding domain resource/action-review fixture.
- Each editable lane hydrates `NodeExecutionContract`,
  `NodeExecutionPacket`, `CodingResourcePacket`, and
  `ImplementationTaskPacket`; then runs the worker small-verb loop through
  bounded snapshot read, edit plan, forced patch-author boundary, validation,
  evidence-from-validation, review artifact refs, and rollback restoration.
- The valid blocker lane returns a typed upstream blocker instead of allowing
  the worker to widen edit authority or invent graph repair.
- The neutral fixture compiles a read-only domain resource packet and generic
  `ActionReviewArtifact`, proving the review spine is not coding-only.
- Proof artifact:
  `.artifacts/execution-platform/proof-hardening-06-worker-smoke-matrix-proof.json`.
- Closeout artifact:
  `.artifacts/execution-platform/proof-hardening-06-worker-smoke-matrix-closeout.json`.
- Runtime remains structurally bounded: no raw prompt, response, provider log,
  tool log, command log, DB rows, transcript, or hidden reasoning is stored.

### `openclaw-convergence.proof-hardening-07-adversarial-entry-suite`

Run the adversarial proof-entry suite and block top-to-bottom proof unless
the substrate fails safely on known dangerous cases.

Status: implemented and closed from DB closeout evidence. The passing proof
artifact is
`.artifacts/execution-platform/proof-hardening-07-adversarial-entry-suite-proof.json`;
the DB closeout artifact is
`.artifacts/execution-platform/proof-hardening-07-adversarial-entry-suite-closeout.json`.
The suite exercises all 11 required negative lanes, records proof-entry
small-verb tool invocations for preparation, structural fault injection,
preflight, safe-block assertions, provider/worker non-invocation assertions,
case results, and suite closeout, and passes Authority Surface Retirement
Gate, Generality Sentinel, and Capability Manifest Conformance.

### `openclaw-convergence.active-queue-34`

Run the full Product/Spec Planning Workflow Plugin Production Proof only after
the seven proof-hardening gates pass.

Status: next DB-ranked proof item after proof-hardening item 07 closeout.

## Required Validation

Each implementation item must include:

- focused unit tests for new contracts;
- replay-boundary tests against a captured Product/Spec graph;
- no-semantic-cheats regression where semantic choices are involved;
- Authority Surface Retirement Gate assertions for any replaced or superseded
  authority path;
- Generality Sentinel fixture coverage for generic contract surfaces;
- Capability Manifest Conformance assertions for executable nodes;
- `node --check` for touched scripts;
- scoped type validation where possible;
- `git diff --check`;
- DB queue/readback evidence for lifecycle and rank changes.

## Deep Completion Question

After each item, ask:

> Did this work remove an entire class of Product/Spec proof failure while
> making the generic orchestration/scheduler/runtime stronger for non-coding
> workflows too, without adding Product/Spec-specific scheduler checks,
> deterministic semantic classifiers, proof-only production paths,
> competing active authority surfaces, runtime semantic judgment,
> coding-only generic contracts, body-in-metadata storage, hidden
> provider/model fallback, stale replay topology, or unreviewable worker edits?

If the answer is not an unqualified yes, patch the structural gap or record a
blocking architecture finding before moving to the next item.

After each item, also ask:

> Did this make the general orchestrator simpler and more authoritative, or
> did it add another semi-authoritative surface?

If the item adds another semi-authoritative surface, it fails until the older
surface is removed, superseded, blocked from production, or demoted to
projection/diagnostic-only.
