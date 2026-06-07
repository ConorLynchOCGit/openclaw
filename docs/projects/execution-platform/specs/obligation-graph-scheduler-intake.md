---
summary: "Canonical intake-boundary spec replacing universal worker packet fanout with a typed, tool-authored ObligationGraph before scheduler WorkIntent planning."
title: "ObligationGraph Scheduler Intake"
---

# ObligationGraph Scheduler Intake

Status: retired for production pre-scheduler intake as of 2026-06-03.

This document is historical design context. The live pre-scheduler intake
contract is now `RequirementMap`, owned by `IntakeStageRunner`; see
`requirement-map-intake-decomposition.md`. Production routing, intake,
scheduler, replay, proof, and Work Queue readback must not require or author an
`ObligationGraph` before scheduling. Historical references may remain only in
retirement rationale, negative tests, or migration notes.

## Decision

Retired. The previous decision below is superseded by RequirementMap intake.

The scheduler-facing intake contract is now `ObligationGraph`, not one full
worker packet per Mission Ledger commitment.

The old assumption was wrong: a Mission Ledger commitment is an owner-visible
obligation, not necessarily an executable implementation task. Read-only
grounding, validation, review, closeout, constraints, prerequisites, and
evidence requirements must not be forced to carry worker/context/
implementation fields before scheduling.

## Canonical Path

```text
prompt
-> route
-> IntakeStageRunner
   -> bounded source prompt artifact/body refs
   -> Mission Ledger
   -> model-authored ObligationGraph
   -> derived DiscoveryBriefSet for implementation obligations
   -> compact SchedulerIntakePacket
-> SchedulerStageRunner creates runnable WorkIntents from runnable obligations
-> NodeLifecycleTransitionRunner compiles executable contracts
-> worker-owned context/search/read/scout/edit/validation/evidence lifecycle
-> Mission Ledger evidence closure
```

`IntakeStageRunner` is the only production owner for the pre-scheduler intake
stages it covers: source prompt artifact/body-ref creation, source objective
payload into Mission Ledger, Mission Ledger replay from an accepted checkpoint,
ObligationGraph authoring, DiscoveryBriefSet derivation from accepted ledger/
obligation facts, accepted obligation graph artifact persistence, and the
scheduler-ready intake gate.
`DynamicAgentTeamGraphRunner` may construct the runner and consume its result,
but it must not inline Mission Ledger, ObligationGraph, or DiscoveryBrief
authoring loops.

`NodeLifecycleTransitionRunner` remains the lifecycle owner after WorkIntent
creation. `ObligationGraph` owns only the pre-scheduler classification of what
kind of obligations exist and which are runnable candidates.

The prompt router, Mission Ledger authoring, and ObligationGraph authoring are
fast local-semantic extraction/classification boundaries. Their default
production model lane is Qwen through OpenRouter, with bounded output and no
hidden reasoning requirement. The first required heavy global reasoning boundary
is scheduler WorkIntent graph creation from the accepted ObligationGraph.

## Obligation Kinds

The model must classify obligations with one of:

- `implementation`
- `read_only_grounding`
- `validation`
- `review`
- `closeout`
- `constraint`
- `prerequisite`
- `evidence_requirement`

Runtime validates only structure, bounds, ids, and storage policy. Runtime does
not deterministically infer semantic obligation kind from strings.

## Required Fields

Every obligation must carry:

- `obligationId`
- `obligationKind`
- `commitmentIds`
- `ownerIntentSummary`
- `successCondition`
- `evidenceExpectation`

Obligations also carry `schedulerRunnable`, a structural scheduler hint that is
separate from semantic kind. This prevents the old ambiguity where
`executable` meant both "source-edit implementation" and "a thing the
scheduler may run".

`implementation` means semantic source-edit or implementation work. It does
not mean every runnable task. Validation, review, closeout, prerequisite, and
observability obligations may be scheduler-runnable under their own semantic
kind when the workflow needs nodes for them.

Implementation obligations additionally carry:

- `executionIntentHint`
- `selectedCapabilityHints`
- `resourceRequirementKinds`
- `schedulerRunnable: true`
- `sourceRefs`
- `authorityScopeRefs`
- `lexicalAnchorRefs`

ObligationGraph does not own `discoveryBrief` and must not expose a
separate discovery tool dialect. It carries the grounding facts that a
later `DiscoveryBriefSet` artifact needs: lexical anchors, source grounding
refs, authority scope refs, resource requirement kinds, capability hints, and
commitment coverage. IntakeStageRunner derives and persists DiscoveryBriefSet
after the graph is accepted, using grounded Mission Ledger and ObligationGraph
facts. Runtime validates ids, sizes, and storage flags only; runtime must not
judge which anchors are semantically good or choose target files from them.

Runnable validation/review/closeout/prerequisite obligations carry
`schedulerRunnable: true` and their own `executionIntentHint`; they must not be
misclassified as implementation just because they are scheduler-runnable.

Non-implementation obligations must not be padded with `workerObjective`,
`contextScoutObjective`, `implementationObjective`,
`expectedImplementationOutput`, or other worker-packet fields just to satisfy
a universal packet schema.

## Toolification

The authoring model must use provider-native obligation small-verb tool calls:

- `obligation.create`
- `obligation.classify_kind`
- `obligation.add_success_condition`
- `obligation.add_evidence_expectation`
- `obligation.add_dependency`
- `obligation.add_constraint`
- `obligation.mark_non_executable`
- `obligation.set_execution_intent`
- `obligation.mark_implementation_candidate`
- `obligation.replace_kind_and_role`
- `obligation.reclassify_as_implementation`
- `obligation.reclassify_as_validation`
- `obligation.reclassify_as_review`
- `obligation.reclassify_as_closeout`
- `obligation.replace_scheduler_runnability`
- `obligation.merge`
- `obligation.retire`
- `obligation.replace_commitment_coverage`
- `obligation.add_source_ref`
- `obligation.add_authority_scope_ref`
- `obligation.add_target_subject_ref`
- `obligation.add_lexical_anchor_ref`
- `obligation.add_resource_requirement_kind`
- `obligation.add_risk_ref`
- `obligation.submit_graph`
- `obligation.repair_missing_kind`
- `obligation.repair_missing_success_condition`
- `obligation.repair_missing_evidence_expectation`
- `obligation.block_with_reason`

Raw JSON packet dialects are not accepted as the canonical production boundary.
Provider-native tool calling is the live transport. Compiler tests may pass
small-verb fixture records directly, but production model output must not use
JSON-shaped tool-call envelopes, direct graph objects, markdown, or prose.

If the model cannot produce valid provider-native tool calls,
`IntakeStageRunner` records a typed intake/tooling blocker. It must not accept a
prebuilt graph JSON fallback.

Evidence/kind mismatches are actionable, not terminal provider failures. For
example, a model that marks a validation-suite obligation as `implementation`
with `test_result` evidence must repair through `obligation.reclassify_as_validation`
or `obligation.replace_kind_and_role`, not redraft the whole graph or force the
obligation through implementation packet fields. Duplicate implementation
obligations are repaired through `obligation.merge`, `obligation.retire`, or
`obligation.replace_commitment_coverage`. Repeated identical repair blockers
collapse into one root-cause artifact.

ObligationGraph authoring is phased under `IntakeStageRunner` control even
when a provider returns a batch of small verbs: inventory obligations, classify
kind/runnability/evidence, attach grounding facts, then submit.
Repair attempts are scoped to the missing or invalid phase fields. The model
must not redraft a full graph object. The accepted graph remains a compact
manifest plus artifact-backed body with no raw prompt, raw response, raw
provider log, or hidden reasoning storage.

## Scheduler Contract

The scheduler consumes `obligationGraphSummary` and creates WorkIntents only
for obligations where `schedulerRunnable` is true. Semantic kind remains
authoritative: implementation, validation, review, closeout, and prerequisite
obligations stay distinct even when runnable. Read-only evidence requirements
and constraints remain ledger obligations unless the scheduler explicitly
selects a runnable capability for them.

Scheduler WorkIntent identity uses the same structural distinction rule as
ObligationGraph. If two runnable implementation WorkIntents share commitment,
capability, and execution intent, the model must either merge/retire them or
make the difference structural with `scheduler.add_target_subject_ref`. Prose
such as "not duplicate" is not enough to preserve two slices unless the model
also supplies target-subject refs the runtime can validate.

For complex missions, an accepted `ObligationGraph` satisfies the pre-scheduler
intake gate. The scheduler must not require `CommitmentWorkPacket` readiness
when an accepted `ObligationGraph` exists.

## Retirement Rules

The following are retired as production intake requirements:

- one full worker packet per commitment before scheduling;
- universal packet missing-field gates across every commitment;
- packet review as an expensive qualitative pre-scheduler ceremony;
- context supply or resource materialization as pre-worker proof success;
- read-only commitments requiring worker/context/implementation fields;
- raw scheduler prompts that ask for full `CommitmentWorkPacket` JSON.

Historical packet artifacts are not a production replay boundary. Replay may
resume from an accepted Mission Ledger and must reauthor the ObligationGraph;
it must not resurrect CommitmentWorkPacket fanout.

The staged Mission Ledger diagnostic experiment is retired and deleted. There
is no production env flag, artifact contract, worker-supervisor special case,
or queue item that can reactivate staged Mission Ledger candidate/review/
canonical-commitment compilation. Mission Ledger production intake is a
runner-owned native small-verb extraction/classification stage, followed by the
typed ObligationGraph stage and derived DiscoveryBriefSet artifact.

## Proof Gates

The pass is incomplete unless:

- a read-only grounding obligation is accepted without worker packet fields;
- an implementation obligation carries only conditional implementation hints;
- implementation obligations carry lexical anchors, source refs, authority
  scopes, capability hints, resource kinds, and commitment coverage sufficient
  for IntakeStageRunner to derive DiscoveryBriefSet without forcing exact
  target files before scheduling;
- runnable validation/review/closeout obligations are accepted without being
  mislabeled as implementation;
- kind/evidence mismatches repair through reclassification small verbs;
- incomplete obligation graphs block precisely and do not fall back to packet
  fanout;
- direct graph output is repaired through obligation small verbs or blocked;
- production source inventory has no staged Mission Ledger imports, flags,
  artifact contracts, or queue-seed items;
- scheduler progress records `scheduler.accept_obligation_graph`;
- Product/Spec proof prompt no longer asks for context supply,
  resource-materialization, or universal packet success;
- runtime artifacts store a compact obligation manifest and artifact-backed
  body, with `rawPromptStored`, `rawResponseStored`, and
  `rawProviderLogStored` false.
