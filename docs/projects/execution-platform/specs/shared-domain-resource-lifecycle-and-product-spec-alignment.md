# Shared Domain Resource Lifecycle And Product/Spec Alignment

## Purpose

The Execution Platform has moved from graph-level context ceremonies toward
node-local execution, resource demand, and lifecycle projections. The
Product/Spec Planning system spec must now align with that architecture. This
spec defines the shared, domain-neutral lifecycle that coding, Product/Spec
Planning, research, QA, docs, human decision, and future workflows must use.

The architectural rule is:

```text
one lifecycle spine
  many workflow domain profiles
  no duplicate planning/coding copies of the same control-plane machinery
```

Coding is one specialization of the lifecycle. Product/Spec Planning is
another. The generic scheduler/orchestrator must not treat coding terms such
as file targets, write gates, or edit readiness as the universal shape of all
work.

## Current Code-Verified Contract

The current production contract is the shared resource/action lifecycle. The
remaining old names are allowed only as negative proof predicates, historical
docs, or coding-domain aliases where the active domain profile maps them to
shared gates.

Verified closure rules:

- `resource_fulfillment` is retired as a production execution intent and
  workflow phase. Shared scheduling uses `resource_demand`.
- Generic lifecycle gates use resource/action names:
  `resource_focus_required`, `resource_demand_open_pending`,
  `resource_ledger_ready`, `domain_resource_selection_required`,
  `domain_action_gate_blocked`, `worker_action_ready`,
  `post_action_validation`, and `evidence_closure`.
- Staged scheduler and WorkIntent model-facing contracts use `resourceRefs`.
  Retired staged-scheduler `targetRefs` is rejected at the model-contract
  boundary. Runtime may still carry legacy graph transport `targetRefs` inside
  older graph structures, but that field is not a model-authored semantic
  target-selection lane.
- `RuntimeNodeCapability` exposes lifecycle transition profile refs, allowed
  lifecycle transitions, required lifecycle tools, domain resource kinds,
  required resource packet kinds, evidence claim kinds, authority scopes, and
  node execution packet policy.
- `ResourceObjectiveFocus`, `NodeResourceDemandSession`, and
  `NodeResourceLedger` are the shared primitives for all domains. Coding maps
  them to repo files/windows/symbols/tests; Product/Spec maps them to prompt
  sections, owner constraints, planning artifacts, research briefs, human
  decisions, and action graph candidates.
- `SharedDomainResourceLifecycleProfile` is the source-level binding between
  the generic lifecycle and each domain. It records the domain profile id,
  resource kinds, action gate kinds, worker action tools, evidence kinds, and
  packet kinds without granting authority or performing semantic routing.
- `RuntimeNodeCapability` now carries `domainProfileId`,
  `resourceSelectionProfileRef`, `domainActionGateProfileRef`,
  `domainActionGateKinds`, `domainWorkerActionToolIds`, and
  `domainEvidenceKinds`. These are manifest/profile fields; they do not create
  a second runner or side state machine.
- Product/Spec Planning capabilities must use planning-domain resource
  manifests and payload refs. They must not require target file snapshots,
  expose `worker.edit.plan`, or expose patch-author tools.
- `NodeLifecycleTransitionRunner` is the only transition owner. For
  `worker_action_ready`, it projects domain worker action tools from the active
  capability profile, so coding nodes see coding edit tools and Product/Spec
  Planning nodes see planning tools.
- `WorkflowPluginSchedulerPolicy` now records an explicit
  `resourceReadinessPolicy`. Coding uses `fresh_context_snapshots`; Product/Spec
  Planning uses `domain_resource_manifest`. Product/Spec Planning executor
  readiness must not depend on coding-shaped fresh context snapshot predicates
  or `node.resource_materialization` runtime tool families.
- Product/Spec Planning evidence now has concrete planning-domain artifact
  contracts for `PlanningIntentRecord`, `PlanningCapsule`,
  `PlanningCapsuleRevision`, `ActionGraphProposal`,
  `CompileRuntimePlanResult`, `HumanPlanningDecision`, and
  `ProductSpecPlanningCloseout`.
- Runtime validates structure, refs, authority, budgets, storage, and
  lifecycle only. Models or humans author relevance, sufficiency, objective
  focus, and domain resource/action selection.

## Canonical Spine

All scheduler-backed workflows must use this sequence:

```text
Intent Front Door
  -> WorkflowDefinition / WorkflowPlugin / CapabilityManifest binding
  -> Mission Ledger
  -> Commitment Work Packets
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> DomainResourceSelection
  -> ProgressiveNodeExecutionPacket
  -> DomainActionGate
  -> worker small-verb loop
  -> validation
  -> evidence claims
  -> review/readback
  -> closeout
```

The scheduler creates and orders work. Payload-backed contracts define work.
The lifecycle runner owns node-local transitions. Runtime validates structure,
refs, authority, budgets, storage, and lifecycle. Models or humans author
semantic focus, relevance, sufficiency, target/action selection, and planning
judgment.

2026-05-29 ownership consolidation: the shared lifecycle is only actually
shared if one runtime owner advances it. Coding, Product/Spec Planning,
research, QA, docs, and future domains must not each add a runner or side
state machine for resource selection, context acquisition, action readiness,
validation, or evidence. `NodeLifecycleTransitionRunner` owns the generic
transition sequence; domain profiles provide resource kinds, small-verb
contracts, capability profiles, validation policies, and evidence modes.
Helper modules can compile manifests and validate refs, but cannot choose the
next lifecycle gate.

## Shared Term Model

The architecture should converge on these shared terms:

| Current term | Shared term | Meaning |
| --- | --- | --- |
| `ResourceObjectiveFocus` | `ResourceObjectiveFocus` | Model-authored focus over legal resource handles for a node objective. |
| `NodeResourceDemandSession` | `NodeResourceDemandSession` | Node-local session requesting resources needed by one consumer node. |
| `NodeResourceLedger` | `NodeResourceLedger` | Append-only node ledger of resource observations, evidence, risks, limitations, and diagnostics. |
| `resource_fulfillment` | `resource_demand` | Retired name for node-local acquisition of needed resources. It must not appear as a production success path. |
| `resource_handoff` | `resource_handoff` | Consumer-bound resource evidence from tools or specialist subturns. |
| `target_selection` | `domain_resource_selection` | Model-authored choice of meaningful resources from the legal universe and ledger evidence. |
| `write_gate` | `domain_action_gate` | Runtime gate proving that the selected domain action has resources, authority, validation, and evidence requirements. |
| `worker_edit_ready` | `worker_action_ready` | Worker may perform the domain action exposed by the current node gate. |
| `source_edit` | `domain_mutation` with coding subtype `file_edit` | Mutation is domain-specific; source file edit is the coding subtype. |

Implementation may use migration aliases only inside controlled refactor
boundaries. Production APIs, readback, proof predicates, and new specs should
use shared terms. Old terms must not remain as alternate success paths.

## Domain Profiles

### Coding Profile

Coding specializes the shared lifecycle as follows:

```text
resource handles:
  repo file, bounded file window, symbol, related test, validation command,
  memory pack, dependency/package metadata

resource selection:
  model-authored target files, new-file intent, validation refs,
  file-change intents

domain action gate:
  write gate

worker action:
  edit plan -> forced patch author -> apply patch -> structural validation

evidence:
  changed file refs, validation refs, review refs, evidence claims
```

Runtime must not select meaningful target files. Runtime compiles legal
handles and validates model-authored selections.

### Product/Spec Planning Profile

Product/Spec Planning specializes the shared lifecycle as follows:

```text
resource handles:
  source prompt section, owner constraint, project fact, research brief,
  existing planning artifact, action graph candidate, human decision ref,
  workflow/capability manifest ref, readback/proof artifact ref

resource selection:
  model-authored planning inputs, research questions, capsule inputs,
  proposal inputs, compile-readiness inputs

domain action gate:
  planning artifact gate, proposal compile gate, human decision gate,
  closeout gate

worker action:
  planning intent record, research brief request, planning capsule draft,
  planning capsule revision, action graph proposal, compile readiness,
  planning closeout

evidence:
  planning intent, planning capsule, planning capsule revision, research
  brief, human decision, action graph proposal, compile-readiness result,
  closeout, readback
```

Product/Spec Planning is proposal authority only. It may propose child work,
but it must not enqueue or execute child runtime jobs without a separate
compile/approval boundary.

Source-level policy:

```text
resourceReadinessPolicy: domain_resource_manifest
freshContextSnapshotsRequiredForWorkerExecution: false
domainResourceManifestRequiredForWorkerExecution: true
runtimeToolFamilies include:
  artifact.payload
  source_prompt.context
  resource.focus
  resource.demand
  resource.ledger
  resource.selection
  domain.action_gate
runtimeToolFamilies exclude:
  node.resource_materialization
```

This is not a fallback from coding context snapshots. It is the Product/Spec
domain profile's first-class readiness contract.

2026-05-29 implementation evidence:

- `WorkflowPluginSchedulerPolicy` now requires an explicit
  `resourceReadinessPolicy`.
- Coding workflow plugins use `fresh_context_snapshots`.
- Product/Spec Planning and Architecture Red Team workflow plugins use
  `domain_resource_manifest`.
- Product/Spec Planning runtime tool families include shared resource/action
  tools and exclude `node.resource_materialization`.
- Product/Spec Planning evidence requires `planning_intent`.
- Source validators exist for `PlanningIntentRecord`,
  `PlanningCapsuleRevision`, and `ProductSpecPlanningCloseout`.
- A real model proof passed at
  `.artifacts/execution-platform/product-spec-domain-profile-real-model-proof/manifest.json`
  with two provider calls, model-authored planning-domain resource focus,
  model-authored planning intent, runner-projected planning action tools, and
  bounded manifest/payload storage.

## Generic Lifecycle Gates

The shared lifecycle gates should become:

```text
resource_focus_required
resource_focus_blocked
resource_demand_open_pending
resource_demand_open
resource_demand_blocked
resource_narrowing_required
resource_ledger_ready
domain_resource_selection_required
domain_resource_selection_blocked
domain_action_gate_blocked
worker_action_ready
post_action_validation
evidence_closure
node_lifecycle_root_cause_collapsed
```

Coding maps `domain_action_gate_blocked` to a write gate. Product/Spec
Planning maps it to planning capsule, action graph proposal, compile
readiness, human decision, or closeout readiness gates.

## Generic Small-Verb Tool Families

Shared lifecycle tools:

```text
resource.focus.accept
resource.focus.mark_unanswerable
resource.demand.open
resource.demand.fulfill_exact_handles
resource.demand.request_file_window
resource.demand.request_symbol
resource.demand.request_related_tests
resource.demand.request_memory_pack
resource.demand.mark_blocked
resource.demand.close
resource.scout.dispatch_specialist_subturn
resource.scout.submit_exact_handles
resource.scout.submit_specialist_handoff
resource.scout.mark_narrowing_blocked
resource.scout.mark_specialist_blocked
resource.scout.append_handoff_to_ledger
resource.ledger.append_file_window
resource.ledger.append_resource_ref
resource.ledger.report_relevant_resource
resource.ledger.report_relevant_file
resource.ledger.report_planning_action_point
resource.ledger.report_existing_pattern
resource.ledger.report_risk
resource.ledger.recommend_edit_point
resource.ledger.recommend_validation
resource.ledger.recommend_domain_validation
resource.ledger.report_limitation
resource.selection.propose
resource.selection.accept
resource.selection.request_revision
resource.selection.mark_blocked
domain.action_gate.evaluate
domain.action_gate.block
domain.action_gate.promote_worker_action_ready
worker.validation.run_structural_default
worker.evidence.claim_from_validation
```

Coding domain tools:

```text
worker.edit.plan
worker.patch.force_author_from_plan
worker.patch.author_edit
worker.repair.mark_upstream_blocker
```

Product/Spec Planning domain tools:

```text
planning.intent.record
planning.research.request_brief
planning.capsule.draft
planning.capsule.revise
planning.human_decision.request
planning.action_graph.propose
planning.compile_readiness.evaluate
planning.closeout.summarize
resource.ledger.report_relevant_resource
resource.ledger.report_planning_action_point
resource.ledger.recommend_domain_validation
```

The model-facing surface must expose only the legal small verbs for the
current `NodeLifecycleProjection`. Workers must not receive broad tool menus
or graph mutation tools. Runtime-only execution-packet transitions are not a
second model dialect; they are runner-owned state mutations behind the same
projection.

2026-05-29 implementation note: the canonical implementation is
`domain-resource-small-verb-tool-surface.ts`. It builds bounded
`domain_resource_small_verb_tool_menu_manifest` artifacts from
`NodeLifecycleProjection`, rejects cross-domain action verbs, rejects
non-canonical tool ids, and compiles Product/Spec planning verbs into
payload-backed planning artifact manifests. The matching runtime registration
uses `resource.selection` and `domain.action_gate` families directly; retired
resource-selection dialects are not production aliases.

## Runtime Ownership Boundary

Runtime owns:

- workflow definition and capability manifest binding;
- node ids, graph ids, refs, hashes, storage refs, and payload refs;
- legal resource universe construction from authority and prior artifacts;
- schema validation and bounded metadata manifests;
- authority, budget, lifecycle, lock, and storage validation;
- deterministic execution of approved tools;
- `NodeLifecycleProjection` readback fields;
- evidence claim structure and commitment id membership.

Models or humans own:

- semantic decomposition and WorkIntent objective;
- resource focus and selected legal handles;
- semantic questions and stop conditions;
- target/resource selection;
- planning sufficiency and product tradeoff judgment;
- edit intent or planning artifact content;
- review findings and closeout judgment.

Runtime must not rank, truncate, summarize, or choose semantically important
resources. When a selected resource is too broad to fulfill exactly, runtime
must call a specialist subturn or request model-authored narrowing; it must
not choose line ranges or planning sections itself.

## Metadata And Artifact Storage

Every lifecycle artifact must be manifest-first and payload-backed:

- metadata stores compact manifests, counts, refs, hashes, statuses, reason
  codes, and next legal transitions;
- bodies, large ledgers, model outputs, provider diagnostics, and proof
  details live in bounded artifact payloads;
- manifests must include byte counts and payload refs;
- raw prompts, raw responses, hidden reasoning, raw tool logs, raw command
  logs, raw provider logs, raw DB rows, secrets, and unbounded transcripts are
  forbidden;
- proof summaries must never overflow metadata caps; full proof bodies must
  be artifact-backed.

This applies equally to coding and planning workflows.

## Product/Spec Proof Placement

The Product/Spec proof must include one real framework implementation by the
new coding system. It should not wait until after every final cleanup gate,
because the final cleanup gate should inspect the code and artifacts produced
by that proof.

Required order:

1. Shared domain-resource lifecycle contracts and terminology are implemented.
2. Product/Spec Planning is re-specified as a domain profile on the shared
   lifecycle.
3. Shared and domain-specific small-verb tools are defined.
4. Capability manifests declare domain resource kinds, resource selection
   contracts, action gate type, worker action tools, validation, and evidence
   modes.
5. The proof framework is split into:
   - coding vertical implementing Product/Spec as target subject;
   - Product/Spec Planning running as its own planner workflow.
6. The coding system runs a real Product/Spec framework implementation proof.
7. Source inventory and residue gates validate that no retired context/coding
   names remain as generic production paths.
8. The full Product/Spec Planning workflow proof runs.

The coding-system implementation proof must execute through
`agent_team.coding` with `agent_team.product_spec_planning` as the target
subject. It must implement a meaningful but bounded Product/Spec framework
slice, not a toy edit.

Minimum acceptable proof slice:

- update or add a Product/Spec Planning domain resource contract;
- add or wire at least one planning-domain small verb or action gate;
- update capability/profile/readback mapping for that planning-domain
  resource;
- run through node-local resource focus, resource demand, resource ledger,
  domain resource selection, action gate, worker action, validation, evidence,
  review, and closeout;
- produce changed-file evidence and validation evidence;
- emit commitment-mapped evidence claims;
- record proof artifacts in run-scoped manifests with artifact-backed bodies;
- prove no broad context/scout/synthesis path counted as success.

This proof is the bridge between "Codex directly implemented the framework"
and "the OpenClaw coding team can implement Product/Spec framework work
itself."

## Documentation Updates Required

Canonical docs must be updated so there is no architectural drift:

- Product/Spec Planning production workflow must describe the shared resource
  lifecycle, not `resource_fulfillment` as a top-level phase.
- Product/Spec checkpointed proof framework must treat coding-as-executor and
  Product/Spec-as-executor as different proofs.
- Lifecycle runner docs must describe generic resource/action gates with
  coding-specific aliases only as domain mappings.
- Node-local demand docs must converge on resource terminology.
- Capability manifest docs must require domain resource kinds, selection
  profile, action gate type, worker action tools, validation modes, and
  evidence modes.
- Work Queue readback docs must project `NodeLifecycleProjection` using shared
  gate names and domain-specific display labels.

## Regression And Proof Gates

Required tests and proofs:

- capability manifests reject generic lifecycle profiles that expose coding
  gates to non-coding workflows without a domain mapping;
- Product/Spec Planning capabilities expose planning resource kinds and
  planning action gates, not file snapshots or write gates;
- coding capabilities still map to file/window/patch gates through the coding
  profile;
- node resource demand supports exact planning-domain resources such as source
  prompt sections, owner constraints, research briefs, planning capsules,
  action graph candidates, compile-readiness inputs, human decisions, workflow
  manifests, proof artifacts, and closeout refs;
- node resource ledger supports payload-backed planning-domain entries without
  file-shaped metadata or raw body storage;
- lifecycle runner projection for `worker_action_ready` uses
  `domainWorkerActionToolIds` and cannot expose coding edit tools to
  Product/Spec Planning capabilities;
- real model middle-lane proof must demonstrate a model choosing planning
  resources from a mixed coding/planning legal handle universe, runtime opening
  node-local demand, appending ledger evidence, and projecting planning action
  tools through the lifecycle runner;
- worker prompts expose only tools allowed by `NodeLifecycleProjection`;
- proof harness rejects `resource_fulfillment`, graph-level `context_scout`, or
  `context_synthesis` as success gates;
- coding-system Product/Spec implementation proof changes real framework
  source and records validation/evidence;
- final Product/Spec Planning proof produces planning artifacts and compile
  readiness without claiming child execution.

## Non-Goals

- Do not build a separate planning-only lifecycle runner.
- Do not keep old names as production fallback aliases.
- Do not let runtime choose semantic resource relevance.
- Do not use Product/Spec-specific substring classifiers.
- Do not count stale replay artifacts as proof progress.
- Do not collapse coding and planning proof semantics into one ambiguous
  Product/Spec proof.
