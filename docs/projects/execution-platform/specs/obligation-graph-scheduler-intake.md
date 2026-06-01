---
summary: "Canonical intake-boundary spec replacing universal worker packet fanout with a typed, tool-authored ObligationGraph before scheduler WorkIntent planning."
title: "ObligationGraph Scheduler Intake"
---

# ObligationGraph Scheduler Intake

## Decision

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
   -> Mission Ledger
   -> model-authored ObligationGraph
-> scheduler creates runnable WorkIntents from runnable obligations
-> NodeLifecycleTransitionRunner compiles executable contracts
-> worker-owned context/search/read/scout/edit/validation/evidence lifecycle
-> Mission Ledger evidence closure
```

`IntakeStageRunner` is the only production owner for the pre-scheduler intake
stages it covers: source objective payload into Mission Ledger, Mission Ledger
replay from an accepted checkpoint, ObligationGraph authoring, ObligationGraph
tool-shape repair, accepted obligation graph artifact persistence, and the
scheduler-ready intake gate. `DynamicAgentTeamGraphRunner` may construct the
runner and consume its result, but it must not inline Mission Ledger or
ObligationGraph authoring loops.

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

- `executable`
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

Executable obligations may additionally carry:

- `executionIntentHint`
- `selectedCapabilityHints`
- `resourceRequirementKinds`

Non-executable obligations must not be padded with `workerObjective`,
`contextScoutObjective`, `implementationObjective`,
`expectedImplementationOutput`, or other worker-packet fields just to satisfy
a universal packet schema.

## Toolification

The authoring model must use the obligation small-verb family:

- `obligation.create`
- `obligation.classify_kind`
- `obligation.add_success_condition`
- `obligation.add_evidence_expectation`
- `obligation.add_dependency`
- `obligation.add_constraint`
- `obligation.mark_non_executable`
- `obligation.mark_executable_candidate`
- `obligation.add_source_ref`
- `obligation.add_risk_ref`
- `obligation.submit_graph`
- `obligation.repair_missing_kind`
- `obligation.repair_missing_success_condition`
- `obligation.repair_missing_evidence_expectation`
- `obligation.block_with_reason`

Raw JSON packet dialects are not accepted as the canonical boundary. Provider
output may be parsed only to recover these tool calls.

If the model returns a direct graph object, markdown, prose, or a malformed
JSON object, `IntakeStageRunner` may run one first-class tool-shape repair turn.
That repair must return the same obligation small-verb family. It is not a
fallback dialect and it cannot accept prebuilt graph JSON.

## Scheduler Contract

The scheduler consumes `obligationGraphSummary` and creates WorkIntents only
for runnable obligations. Read-only evidence requirements and constraints can
remain ledger obligations unless the scheduler explicitly selects a runnable
capability for them.

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
canonical-commitment compilation. Mission Ledger production intake is the
single-pass ledger stage owned by `IntakeStageRunner`, followed by the typed
ObligationGraph small-verb stage.

## Proof Gates

The pass is incomplete unless:

- a read-only grounding obligation is accepted without worker packet fields;
- an executable obligation carries only conditional executable hints;
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
