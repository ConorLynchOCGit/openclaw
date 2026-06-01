---
summary: "Payload-backed execution contracts, context requirements, branch-scoped frontier state, no-progress collapse, observability, and validation-phase semantics for the generic orchestration runtime."
title: "Execution Contract Spine, Context Requirements, And Frontier State"
---

# Execution Contract Spine, Context Requirements, And Frontier State

Date: 2026-05-25

Status: active P0 pre-Product/Spec architecture. This spec supersedes any
remaining pre-proof plan that lets graph node metadata carry executable
semantics, lets context handoff bodies compile directly into implementation,
uses broad context synthesis as default glue, repeats the same sibling
materialization blocker, or derives owner readback gates from stale checkpoint
phase labels.

2026-05-27 architecture-transition closure update: the active closure spec is
[Architecture Transition Closure And Context Objective Focus](/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus).
This contract spine is now interpreted through that stronger gate: graph nodes
must not create default context scout fanout; context requirements must be
narrowed by a model-authored focus/subset decision before provider payload
construction; scope revision must execute as production lifecycle; and
WorkIntent context readiness must read `NodeResourceDemandSession` and
`NodeResourceLedger` state before any legacy graph `context_supplies` edge
projection.

2026-05-26 node-local node resource demand update: this spec now treats context
frontier/shard machinery as internal fulfillment detail for node-local
`NodeResourceDemandSession`s, not as the default pre-worker lifecycle. The active
governing update is
[Node-Local Context Demand And Legacy Evisceration](/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration).
The default path is `WorkIntentGraph -> NodeExecutionContract -> partial
NodeExecutionPacket -> NodeResourceDemandSession -> NodeResourceLedger -> target
selection -> hydrated write gate -> worker execution`. A graph-visible
`context_scout` prerequisite or `context_synthesis` node is illegal unless an
explicit workflow capability defines it.

2026-05-26 executable-spine recovery update: this spec remains the contract
spine foundation, but the active pre-proof work is now governed by
[Control-Plane Executable Spine Recovery](/projects/execution-platform/specs/control-plane-executable-spine-recovery).
That spec turns the recurring failure pattern into a six-item DB-backed
tranche: WorkIntent/capability acceptance, context requirement structural
reshard, NodeExecutionPacket hydration, worker one-edit canary,
readiness/readback/root-cause collapse, and production-faithful replay proof.

2026-05-25 proof-hardening update: contract-spine items 01-09 are closed from
focused evidence, and the broad item 10 replay proof is decomposed by
[Product/Spec Proof Hardening And Worker Boundary Suite](/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite).
The next pre-proof work is no longer one monolithic replay pass. It is the
seven-gate proof-hardening tranche: production-faithful replay epochs,
target-selection router/payload budget, context-repair requirements,
readiness/child upsert, reviewable patch artifacts, multi-child worker smoke
matrix, and adversarial proof-entry suite. The first six proof-hardening
items are closed from DB closeout evidence; the remaining gate starts at the
adversarial proof-entry suite.

## Why This Exists

The latest Product/Spec proof/replay failures are not isolated Kimi, Qwen,
context-scout, or scheduler bugs. They expose a control-plane spine gap:
different runtime layers still reinterpret what work a node represents, what
resources it needs, what evidence it must produce, and what transition is
legal next.

The system already has useful components:

- Mission Ledger and Commitment Work Packets.
- `WorkIntent`.
- node-scoped context broker substrate.
- `NodeReadinessState`.
- domain resource packets.
- payload store and manifest-only graph metadata policy.
- small-verb worker loop.
- evidence and readback projections.

The failure is that these components are not strict enough as one spine. A
single semantic work unit can still be flattened, split, replayed, or
materialized in a way that drops execution intent, evidence mode, context
requirements, resource requirements, or branch-local blockers.

The forbidden shortcut remains:

```text
context_synthesis group -> implementation node
```

But the broader forbidden class is now:

```text
any graph node body/metadata -> executable worker dispatch
```

Executable semantics must live in payload-backed contracts. Graph nodes
schedule work; they do not define work.

## Can This Be Pushed Further?

Question asked before freezing this spec:

> Can I push or extend these changes further?

Answer after pushing the architecture:

Yes, the direction can be pushed beyond the initial fix list. The maximal
extension is to make the contract spine generic across workflow domains:

```text
WorkIntent
  -> NodeExecutionContract
  -> partial NodeExecutionPacket
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> target/resource requirement selection
  -> hydrated NodeExecutionPacket
  -> domain resource packet
  -> worker/tool/human execution
  -> validation result
  -> typed evidence claim
  -> readback/closeout state
```

After that extension, the answer becomes black-and-white:

No, this spec cannot be pushed materially further without implementation
evidence. Additional detail would become speculative API design. The next
necessary information is runtime proof: whether these contracts eliminate the
observed leak points in scheduler replay, materialization, worker invocation,
readback, and validation gating.

## Governing Principle

The model decides semantic meaning, usefulness, sufficiency, work intent,
capability fit, and qualitative evidence sufficiency. Runtime owns schema,
ids, refs, bounds, persistence, authority, lifecycle, locks, validation
execution, graph writes, replay boundaries, provider/tool execution, and
readback projection.

No deterministic code may infer semantic execution intent from substrings,
filenames, Product/Spec wording, context-synthesis group prose, artifact ref
names, or failure messages.

Runtime may validate that a declared semantic value is present, registered,
compatible with capability requirements, compatible with evidence mode, and
backed by required refs. It may not invent the semantic value.

## Proof-Hardening Item 04 Closeout: Readiness And Child Epoch Authority

Readiness recomputation is now a structural control-plane boundary. The
runtime compares current payload refs and hashes for `NodeExecutionContract`,
`NodeExecutionPacket`, domain resource packet, resource packet, boundary
epoch, lifecycle state, validation phase, next legal transitions, and
limitation-waiver refs. Persisted readiness is a projection cache used for
readback and operator visibility; it cannot unlock execution when the current
payload-backed contract spine disagrees.

The runtime exposes this boundary through small verbs instead of broad graph
mutation:

- `node.recompute_readiness`
- `node.compare_readiness_projection`
- `node.mark_readiness_stale`
- `node.upsert_child_for_epoch`
- `node.supersede_child_epoch`
- `frontier.evaluate_epoch_eligibility`
- `frontier.block_stale_child`
- `readback.project_readiness_drift`

Split-child frontier eligibility is now tied to the current boundary epoch and
parent contract/packet/resource hashes. A stale child can preserve artifacts
for audit, but cannot remain in the executable frontier. Work Queue readback,
canonical readback gates, and latest-run-state expose readiness drift, missing
fields, stale flags, and next legal transition.

This remains domain-neutral. The neutral regression fixture uses a non-coding
`permit_review.workflow` resource packet, and no-semantic-cheats coverage
guards against Product/Spec-specific readiness logic or semantic substring
classifiers. Runtime owns refs, hashes, epochs, lifecycle, schema, validation
phase, and authority. Models or humans own semantic usefulness, sufficiency,
and quality judgment.

## Canonical Flow

The generic orchestration runtime must enforce this spine:

```text
owner prompt
  -> Mission Ledger / obligation graph
  -> Commitment Work Packets
  -> WorkIntent DAG
  -> capability validation
  -> ResourceRequirementPacket
  -> ContextScoutExecutionPacket / context executor packet
  -> context evidence and limitation state
  -> ResourceRequirementPacket
  -> NodeExecutionContract
  -> NodeExecutionPacket
  -> domain resource packet
  -> worker small-verb loop or non-coding executor
  -> validation phase result
  -> typed evidence claim
  -> branch-scoped frontier state
  -> owner readback
  -> closeout
```

Every step is payload-backed when it carries nontrivial body data. Graph node
metadata and Work Queue projection metadata contain refs, hashes, counts,
short summaries, lifecycle status, reason codes, and bounded owner snippets
only.

## 1. Canonical NodeExecutionContract

### Contract Purpose

`NodeExecutionContract` is the canonical payload-backed source of executable
semantics. It is the bridge between semantic `WorkIntent` and runnable
`NodeExecutionPacket`.

Graph nodes are scheduling envelopes. They may reference a contract, but they
do not contain the contract body.

### Required Fields

`NodeExecutionContract` must include:

- `contractId`
- `contractVersion`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `branchId`
- `nodeId`
- `workIntentRef`
- `sourceCommitmentIds`
- `executionIntent`
- `capabilityId`
- `capabilityVersion`
- `executorKey`
- `workerRef`
- `roleClass`
- `evidenceMode`
- `expectedEvidenceClaimKinds`
- `resourceRequirementRefs`
- `resourceRequirementRefs`
- `domainResourcePacketKind`
- `nodeExecutionPacketRequired`
- `allowedAuthorityScopes`
- `allowedToolFamilies`
- `allowedPathScopes` when coding-related
- `forbiddenPathScopes` when coding-related
- `validationPhaseRequirements`
- `stopConditions`
- `repairTransitions`
- `nextLegalTransitions`
- `consumerRefs`
- `dependencyRefs`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawProviderLogStored: false`
- `rawToolLogStored: false`
- `rawCommandLogStored: false`
- `rawDbRowsStored: false`

### Contract Body Vs Manifest

The payload body stores the full contract. Graph metadata stores:

- `contractRef`
- `contractVersion`
- `contractHash`
- `contractByteCount`
- `workIntentRef`
- `executionIntent`
- `capabilityId`
- `executorKey`
- `workerRef`
- `evidenceMode`
- `domainResourcePacketKind`
- short objective summary
- bounded target commitment sample
- readiness status
- reason codes

Graph metadata must not store full target refs, snapshots, context packets,
task packets, split-child arrays, provider payloads, raw logs, raw prompt
content, or hidden reasoning.

### Split-Child Inheritance

Split children inherit the parent `NodeExecutionContract` by ref and narrow it
through a runtime-compiled `ContractOverridePacket`.

Allowed child overrides:

- child task id.
- target file subset or domain resource subset.
- dependency refs.
- branch id.
- target line ranges or snapshot refs.
- child-specific validation refs.
- child-specific evidence expectation refs.
- child-specific context requirement refs.
- child-specific stop conditions.

Forbidden child overrides:

- changing `executionIntent` without a new model-authored WorkIntent or
  explicit model-authored contract revision.
- changing `evidenceMode` without capability/evidence review.
- changing `capabilityId`, `executorKey`, or `workerRef` by runtime guess.
- dropping parent context requirements silently.
- dropping parent validation or evidence requirements silently.
- expanding authority or path scope beyond the parent.

If a split child cannot inherit a valid executable contract, runtime must halt
that child before materialization and emit a contract inheritance blocker.

### Domain Portability

`NodeExecutionContract` is not coding-only.

Examples:

- coding: target refs, snapshots, edit scopes, validation refs.
- planning: planning source refs, decision refs, capsule refs, action graph
  compile refs.
- research: source refs, freshness metadata, citation requirements.
- QA: environment refs, command refs, fixture refs, expected result refs.
- design: asset refs, design-token refs, screenshot refs.
- marketing: campaign brief refs, brand constraints, factual source refs.
- memory/proactivity: retrieval refs, memory candidate refs, cooldown refs.
- closeout: evidence packet refs, readback refs, profile evaluation refs.

The contract names the domain resource packet kind; capability-specific
materializers hydrate the domain packet.

### Implementation Evidence - 2026-05-25

Item `openclaw-convergence.contract-spine-01-node-execution-contract`
implemented the first contract-spine slice:

- `NodeExecutionContract` is now a first-class schema with payload-backed body,
  bounded manifest, readback summary, storage-policy flags, explicit
  `executionIntent`, capability, executor, worker, evidence mode, context
  requirements, resource requirements, validation refs, authority scope, and
  domain resource packet binding.
- `ContractOverridePacket` plus split-child inheritance preserves parent
  executable semantics while allowing only narrow child overrides for task id,
  branch, dependencies, target resource subset, child context/resource refs,
  validation refs, evidence refs, and stop conditions.
- `NodeExecutionPacket` now carries `nodeExecutionContractRef`, contract
  version, and contract hash. Worker invocation readiness requires hydrated
  contract body, node packet body, and domain resource packet body before any
  provider/model call.
- Runtime readiness blocks contract ref/hash/node/capability/executor/worker/
  execution intent/evidence mode/resource-kind/commitment mismatches before
  worker dispatch.
- Graph metadata accepts only contract manifests/refs and rejects embedded
  contract bodies. Runtime artifact storage registers
  `execution_platform.node_execution_contract` as the payload body location.
- Worker adapters, Codex parity bridges, non-Codex worker loop, scheduler
  materialization, boundary checkpoints, progress events, Work Queue
  projection, and owner readback now carry contract refs without storing raw
  bodies in graph metadata.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts`
  passed 86 tests.
- `pnpm tsgo:fast -- ...contract-spine touched files` passed full-repo
  fallback type verification.
- `git diff --check` passed.

Residual not closed by this slice: the dynamic agent-team graph production
fixture currently still stops after staged graph acceptance with open mission
commitments. That failure is upstream of contract materialization and remains
part of later scheduler/context/replay proof work, not a reason to loosen the
contract gate.

## 2. Context Requirements Compiler

### Required Boundary

Context supply must not start from a broad role prompt. It must start from a
compiled context requirement:

```text
WorkIntent -> ResourceRequirementPacket -> ContextScoutExecutionPacket
```

`ResourceRequirementPacket` is the canonical contract for what context a
consumer node needs before materialization or execution can advance.

### ResourceRequirementPacket Fields

Required:

- `resourceRequirementId`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `consumerBranchId`
- `consumerNodeId`
- `workIntentRef`
- `sourceCommitmentIds`
- `contextPurpose`
- `semanticQuestions`
- `requiredResourceKinds`
- `candidateSourceRefs`
- `candidateRepoAreaRefs`
- `candidateMemoryContextPackRefs`
- `knownTargetRefs`
- `knownValidationNeedRefs`
- `downstreamCapabilityId`
- `downstreamExecutionIntent`
- `downstreamEvidenceMode`
- `contextAcceptanceContract`
- `limitationPolicy`
- `byteBudget`
- `toolBudget`
- `providerTimeoutPolicy`
- `repairPolicy`
- `rawStorageFlags`

`contextPurpose` is model-authored or workflow-authored. Runtime validates it
against registered context-purpose values and capability requirements.

### ContextScoutExecutionPacket Fields

`ContextScoutExecutionPacket` is compiled from one or more
`ResourceRequirementPacket`s only when those requirements share a consumer,
capability, and context purpose without creating a bloated prompt.

Required:

- packet id/version.
- context requirement refs.
- consumer node id and branch id.
- exact semantic questions.
- bounded source prompt excerpt refs.
- bounded commitment packet refs/summaries.
- bounded repo/memory/source refs.
- allowed context tools.
- expected handoff fields.
- limitation classification choices.
- provider/model policy.
- input byte budget.
- per-tool output bounds.
- next legal transitions.

The scout should receive handles and excerpt refs, not the whole prompt,
whole ledger, whole packet set, or whole repo map.

### Context Scout Tool Path

The model-facing context scout surface should be small verbs:

- `context.get_requirement`
- `context.request_prompt_excerpt`
- `repo.search`
- `repo.find_files`
- `repo.open_file_window`
- `repo.open_symbol`
- `repo.get_related_tests`
- `context.add_finding`
- `context.mark_limitation`
- `context.submit_handoff`

The scout does not write graph nodes, ids, scheduler envelopes, worker refs,
or lifecycle status. Runtime compiles those from accepted handoff evidence.

## 2A. Target Selection And Resource Authority Boundary

### Required Boundary

Context evidence can identify candidate files, patterns, risks, and
recommended edit points. It cannot grant edit authority. A context scout is a
read/context role, so its recommendations remain candidate resource evidence
until a model-authored target-selection decision selects concrete executable
targets and runtime validates the selection structurally.

The forbidden shortcut is:

```text
context scout recommendedEditPoints / verified refs -> implementation targetRefs
```

The required path is:

```text
WorkIntent
  -> ResourceRequirementPacket
  -> context evidence candidates
  -> TargetSelectionPacket / ResourceSelectionPacket
  -> ImplementationContextPacket
  -> NodeExecutionPacket
```

### TargetSelectionPacket

For coding implementation nodes, `TargetSelectionPacket` is the concrete
resource-selection contract between context evidence and implementation
resource materialization.

Required fields:

- `packetKind: "target_selection_packet"`
- `schemaVersion`
- `packetId`
- `packetRef`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `nodeId`
- `sourceWorkUnitId`
- `targetCommitmentIds`
- `candidateConcreteFileRefs`
- `selectedTargetFileRefs`
- `fileChangeIntents`
- `validationDiscoveryPlan`
- `selectionRationale`
- `status`
- `reasonCodes`
- `invalidSelections`
- `uncoveredSelectedTargetFileRefs`
- raw-storage flags, all false.

Runtime validation is structural only:

- selected refs must be present in the candidate set.
- selected refs must be inside allowed authority scope.
- selected refs must map to the implementation node/work intent.
- every selected file must have a model-authored file-change intent.
- new-file selections must have parent directory snapshots before worker
  execution.
- validation refs or a validation discovery plan must be present before worker
  invocation.

Runtime must not choose semantically useful files from candidate prose,
filenames, artifact refs, or Product/Spec terms. Runtime may only validate a
model-authored selection against candidate refs and authority scope.

### Generic ResourceSelectionPacket

For non-coding domains, this same boundary generalizes to
`ResourceSelectionPacket`: candidate resource refs, selected resource refs,
selection rationale, domain-specific resource intent records,
validation/discovery plan, and structural invalid-selection diagnostics.

The runtime may compile domain packets from the generic selection packet, but
it may not infer resource usefulness by keyword heuristics.

### Readiness Semantics

If an implementation node has broad directory targets and candidate concrete
files but lacks an accepted target-selection packet, readiness must block with:

- reason code: `implementation_context_concrete_target_selection_required`
- repair action: `select_concrete_target_files`
- next legal transition: `select_concrete_target_files`

This is not a context repair and must not spawn another context scout by
default. More context may be requested only when candidate refs are absent or
the target-selection model explicitly reports missing context.

### Replay/Production Wiring Evidence - 2026-05-25

- Boundary replay now invokes a bounded model-authored target-selection
  subturn when a source-edit implementation node has broad directory targets,
  candidate concrete file refs, and no accepted selected target refs/file
  change intents. The model can only select candidate refs or report a typed
  blocker; runtime compiles the result into `TargetSelectionPacket`.
- The target-selection model call uses the explicit
  `implementation_target_selection` model-contract boundary and the
  `tool_selection` task class. Runtime owns packet ids, hashes, structural
  validation, snapshots, implementation task packets, node execution packets,
  and readiness.
- Boundary replay attaches target-selection packets as payload-backed
  artifacts and threads target-selection refs through implementation context
  packet readback, split-child handoffs, node metadata manifests, and
  materialization edges.
- Production scheduler model calls now bind to
  `scheduler_global_reasoning`, matching replay. This fixes the
  model-contract observability gap where scheduler calls previously appeared
  as generic dynamic JSON calls.
- The latest scheduler-first replay did not reach target-selection execution
  because accepted context supply covered only `13/14` blocking commitments
  and the scheduler selected a `context_scout` repair node for
  `provide-context-research-and-planning-artifacts`. This is correct
  control-plane behavior, but exposes a remaining replay/tooling gap: replay
  can create a context repair node but cannot yet execute that context scout
  and resume into implementation in one boundary lane.
- Proof-hardening item 02 closed the target-selection router/budget slice:
  resource selection is now a generic payload-backed packet boundary with
  model-authored small verbs, field-specific repair requests, provider-policy
  preflight, payload budget blocking before provider calls, and no direct
  promotion from context prose, verified refs, selectedTargetFileRefs, or
  file-change intents into edit authority. The next spine gap is context
  repair requirements and consumer-aware context repair execution.

### Remaining Tooling Gaps From Replay Evidence

- Scheduler input bundles are still oversized (`~351KB` observed on the
  Product/Spec replay) while the global-reasoning policy declares a `240KB`
  input bound. Policy binding is visible, but input-byte enforcement is not
  yet a hard provider-call preflight.
- Scheduler repair still uses broad global reasoning payloads for structural
  contract issues. The durable fix is field-specific staged-scheduler repair:
  for example, `workIntent.executionIntent` repair should receive only the
  rejected work intent, valid execution-intent enum, selected capability, and
  policy conflict, not the entire graph/prompt/packet corpus.
- A replayable context-scout execution boundary is needed so a missing
  context repair node can run, persist accepted handoff evidence, and resume
  the same proof into implementation/resource materialization without a full
  top-of-pipe rerun.

### Implementation Evidence - 2026-05-25

Item `openclaw-convergence.contract-spine-02-resource-requirement-compiler`
implemented the resource-requirement boundary:

- `ResourceRequirementPacket` is now a first-class payload-backed artifact with
  manifest/readback helpers, explicit consumer node/branch, WorkIntent ref,
  context purpose, semantic questions, required context kinds, target/source/
  validation refs, downstream capability, downstream execution intent,
  downstream evidence mode, acceptance/limitation contracts, byte/tool/model
  policies, and raw-storage flags.
- Context scouts now compile through
  `WorkIntent -> ContextBrokerRequest -> ResourceRequirementPacket ->
  ContextScoutExecutionPacket`; a scout execution packet blocks without a
  ready context requirement and blocks mixed consumers/capabilities/purposes
  instead of silently merging broad context.
- The production dynamic graph runner and standalone context-scout node
  executor persist `execution_platform.resource_requirement_packet` artifacts
  before scout execution, invoke the small runtime verb
  `context.get_requirement`, and pass only ready requirement packets into the
  scout packet compiler.
- Scheduler-generated node-scoped context supply and context repair nodes now
  carry target WorkIntent refs, downstream execution intent, evidence mode,
  capability, broker request refs, and requirement refs without substring
  classifiers or Product/Spec-specific logic.
- Graph metadata remains manifest-only: embedded `resourceRequirementPacket`
  bodies are rejected, while bounded context requirement manifests/refs are
  accepted.
- Work Queue active graph projection, execution read model, and compact
  latest-run-state expose context requirement refs, statuses, and reason codes
  beside context broker refs so owner readback can distinguish "requirement
  missing" from "scout/model failed."
- `context.get_requirement` is registered as a first-class read-only runtime
  tool with bounded scheduler tool traces.

Item `openclaw-convergence.proof-hardening-03-context-repair-requirements`
extended the same boundary to repair paths:

- `ContextRepairRequirementPacket` is now the payload-backed contract for
  context-repair nodes. It points to the context broker request and nested
  `ResourceRequirementPacket`, declares the failed consumer/branch/WorkIntent,
  preserves model-authored semantic questions and context purpose, records
  missing structural fields/schema-policy paths, and marks lifecycle as
  `consumer_blocking` or `diagnostic_only`.
- The runtime tool surface now has small repair verbs:
  `context_repair.compile_requirement`, `context_repair.link_consumer`,
  `context_repair.mark_diagnostic_only`, and
  `context_repair.block_without_requirement`.
- Scheduler-created repair nodes are manifest-only graph nodes with declared
  consumer edge authority. A production repair node cannot execute without a
  broker ref, requirement ref, and `context_supplies` edge to the declared
  consumer. Diagnostic-only repair can run for evidence but cannot unlock the
  consumer.
- Context scout executors persist
  `execution_platform.context_repair_requirement` artifacts before scout
  execution. A blocked repair requirement does not pass its nested requirement
  into the scout packet compiler, preventing schema-valid but authority-invalid
  repair from becoming a model call.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 35 tests.
- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  passed 94 tests.
- `pnpm tsgo:fast -- ...contract-spine-02 touched files` passed full-repo
  fallback type verification.

Residual not closed by this slice: this establishes the required boundary
and scout packet contract, but does not yet retire every broad/demand-driven
context topology issue. The next queue item owns the demand-driven context
tool path, replay alignment, and synthesis-retirement audit.

## 3. Node-Local Context Demand, Not Blob Context

Context is acquired by a running or ready-to-run consumer node through a
`NodeResourceDemandSession`. It is not globally front-loaded by default. The node
may open repeated exact demands as execution discovers missing file windows,
symbols, tests, memory packs, patterns, risks, or validation needs.

Allowed global or barrier context:

- explicit workflow definition requires a coordination node.
- model-authored WorkIntent structure review identifies shared dependency,
  conflict, public API decision, integration order, validation collision, or
  cross-branch evidence dependency.
- owner/human decision requires a shared planning synthesis artifact.

Forbidden default behavior:

- broad context fanout before any work intent or consumer execution contract
  exists.
- context synthesis as automatic glue between packets and implementation.
- graph-visible context scout prerequisites as default readiness repair.
- compressing many unrelated commitment questions into one scout because it
  is cheaper to schedule one call.
- letting accepted scout output unlock implementation for consumers it did
  not address.
- treating `accepted_with_limitations` context as executable readiness
  without a consumer-specific waiver.

Node-local node resource demand must support progressive tools. If direct repo,
file, test, or memory tools can satisfy a demand, no scout subturn runs. If a
specialist scout is needed, it is a subturn bound to the requesting
`NodeResourceDemandSession` and appends results to that node's
`NodeResourceLedger`. If a worker later discovers a missing resource, it
requests context for that node only.

Context frontier requests, shard manifests, shard execution packets, handoff
reviews, and merge packets are allowed only as internal fulfillment details
for a node-local demand session unless a workflow definition explicitly
promotes them to first-class semantic graph work.

### Implementation Evidence 2026-05-25

This boundary is now implemented as a production/replay policy guard, not a
Product/Spec-only prompt rule.

- `RuntimeWorkGraphNodeSummary` exposes explicit synthesis-coordination
  manifest fields:
  `contextSynthesisCoordinationRequired`,
  `contextSynthesisCoordinationPolicyRef`,
  `contextSynthesisCoordinationReasons`, and
  `contextSynthesisDiagnosticOnly`.
- `RuntimeWorkGraphScheduler` treats `context_synthesis` as legal
  coordination only when the node has explicit workflow/model-authored
  coordination metadata and an allowed coordination reason code. Implicit
  synthesis nodes are rejected at staged-graph apply time before they can be
  persisted.
- synthesis lifecycle, existing-node filtering, policy reason generation, and
  join-edge derivation all use the explicit coordination manifest. There is
  no default `context_synthesis` bridge from packets/context to
  implementation.
- context supply and context repair nodes created by the scheduler carry
  `demandDrivenContextPolicyRef`,
  `nodeResourceDemandScope: consumer_node`,
  `defaultContextSynthesisRetired: true`,
  `defaultContextSynthesisBypassed: true`, and
  `contextSynthesisAllowed: false`.
- context input/readiness detection no longer scans handoff refs with
  semantic substrings. It uses explicit context metadata refs, structural
  `context_supplies` edges, and persisted context snapshots.
- Product/Spec boundary replay uses the same demand-driven context metadata
  and no longer inserts synthetic context-synthesis refs into implementation
  task packets.
- no-semantic-cheats tests assert the retired substring patterns and replay
  synthesis injection paths remain absent.

Validation evidence:

- `pnpm test:file extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 36 tests.
- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed 108 tests.
- `pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts`
  passed scoped type validation.

## 4. Frontier Root-Cause Collapse

### Problem

Recent proof runs repeated the same materialization blocker across many
sibling nodes and iterations. That is not progress. It creates latency,
cost, artifact spam, and misleading Work Queue state.

### NoProgressSignature

Add a canonical no-progress signature over:

- `stage`
- `nodeKind`
- `capabilityId`
- `executionIntent`
- `evidenceMode`
- `missingFields`
- `reasonCodes`
- `contractVersion`
- `domainResourcePacketKind`
- `schemaErrorPath`
- `policyErrorPath`
- `providerProfileId` when model/provider-related
- `branchSimilarityClass`

The signature must be stable across sibling nodes that fail for the same
root cause while still preserving branch-local ids in the artifact body.

### Collapse Rule

If the same signature repeats across sibling nodes or frontier iterations:

1. stop creating more duplicate materialization/repair attempts;
2. preserve successful sibling evidence;
3. emit one `FrontierRootCauseArtifact`;
4. mark affected branches blocked by the same root cause;
5. surface the root cause in latest-run-state and Work Queue readback;
6. expose the next legal transition:
   - contract repair;
   - context requirement repair;
   - resource materializer fix;
   - capability manifest fix;
   - model/tool policy fix;
   - owner review;
   - terminal diagnostic.

### Root-Cause Artifact Fields

- signature hash.
- affected node ids.
- affected branch ids.
- unaffected/succeeded sibling branch ids.
- first occurrence ref.
- last occurrence ref.
- missing fields.
- reason codes.
- schema/policy paths.
- contract refs and versions.
- domain resource packet kinds.
- attempted transitions.
- recommended repair boundary.
- raw-storage flags all false.

Runtime does not decide semantic sufficiency. It collapses repeated structural
failure evidence.

### Implementation Evidence 2026-05-25

This boundary is now implemented in the scheduler/frontier/readback path.

- `RuntimeWorkGraphSchedulerFrontierState` includes bounded
  `blockedNodeDiagnostics` for every blocked planned frontier node. Each
  diagnostic records node kind, capability id, execution intent, evidence
  mode, lifecycle state, missing structural fields, reason codes, contract
  ref/version, readiness ref, domain resource packet kind/ref, schema and
  policy paths, provider profile id, next transitions, and a stable branch
  similarity class.
- `RuntimeWorkGraphNoProgressSignature` now includes the structural fields
  from this spec: stage, node kinds, capability ids, execution intents,
  evidence modes, missing fields, reason codes, contract versions, domain
  resource packet kinds, schema/policy paths, provider profiles, branch
  similarity classes, and next legal transitions.
- the no-progress signature hash no longer includes branch-local ids that
  would prevent sibling collapse and no longer uses the previous
  blocker/missing/conflict reason-code regex classifier.
- repeated no-progress creates a
  `runtime_work_graph_frontier_root_cause` artifact with affected node ids,
  branch ids, unaffected/succeeded sibling branches, successful sibling
  evidence refs, first/last occurrence refs, missing fields, reason codes,
  schema/policy paths, contract/resource refs, provider profiles, attempted
  transitions, recommended repair boundary, next transitions, and all raw-
  storage flags false.
- `scheduler.record_frontier_root_cause` is now a first-class small runtime
  tool boundary.
- latest-run-state and Work Queue active graph readback expose root-cause
  state, signature hash, repeat count, systemic flag, recommended repair
  boundary, affected nodes/branches, sibling evidence survival, missing
  fields, schema/policy paths, contract/resource/provider fields, and next
  legal transitions.

Validation evidence:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  passed 282 tests.
- `pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  passed scoped type validation.

## 5. Branch-Scoped Frontier State

### BranchScopedFrontierState

Every frontier branch must persist independent state:

- `branchId`
- `parentBranchId`
- `nodeId`
- `workIntentRef`
- `contractRef`
- `readinessRef`
- `resourceRequirementRefs`
- `domainResourcePacketRef`
- `status`
- `blocker`
- `blockerSignature`
- `consumerRefs`
- `dependentConsumers`
- `siblingBranchIds`
- `successfulEvidenceRefs`
- `failedEvidenceRefs`
- `repairNodeRefs`
- `diagnosticOnlyNodeRefs`
- `nextLegalTransitions`
- `updatedAt`

Successful sibling evidence survives failed siblings. A single failed branch
must not collapse the whole graph unless the root cause is systemic and
frontier collapse explicitly says so.

### Consumer-Aware Repair

Failed branches get one of:

- consumer-aware context repair node.
- contract repair node.
- resource repair node.
- capability manifest repair blocker.
- diagnostic-only blocker with no consumer.
- terminal owner review blocker.

Repair nodes must have consumers or be explicitly diagnostic-only. Zero-
consumer repair nodes must not be counted as production progress.

### Implementation Evidence 2026-05-25

`BranchScopedFrontierState` is now a production runtime/readback contract for
the scheduler frontier:

- scheduler frontier state and parallel frontier readback carry
  `branchScopedFrontierStates` beside branch results;
- each branch state records branch id, parent branch id, node id/kind,
  WorkIntent ref, contract ref, readiness ref, context requirement refs,
  resource packet refs, status, blocker code/summary/schema/policy path,
  blocker signature, consumer refs, dependent consumers, sibling branch ids,
  successful and failed evidence refs, repair and diagnostic-only node refs,
  next legal transitions, capability/executor/model/worker/tool phase, root
  cause ref, and raw-storage flags;
- successful sibling evidence refs are preserved on blocked/failed sibling
  branches instead of being hidden by the failed branch result;
- repair nodes with no declared consumers are projected as diagnostic-only;
- scheduler progress records
  `scheduler.record_branch_scoped_frontier_state` as a bounded runtime tool
  boundary;
- latest-run-state, Work Queue active graph projection, and execution read
  model project branch id, node id, blocker, dependent consumers, evidence
  refs, readiness ref, contract ref, schema/policy path, repair refs,
  diagnostic refs, root cause ref, and next legal transition from canonical
  branch state;
- branch status classification uses exact lifecycle/action/failure/reason
  code sets and no longer relies on `blocked`/`missing` substring tests;
- focused scheduler/readback/latest-run-state/no-semantic-cheat tests and
  scoped type validation prove the branch-state projection path.

## 6. Scheduler Observability Envelope

Hidden reasoning cannot be exposed. Useful live optics can and must be
exposed through a bounded scheduler/model-call envelope.

### SchedulerModelCallEnvelope

Persist at preflight, heartbeat, completion, rejection, and repair:

- model call id.
- runtime job id.
- graph id.
- scheduler iteration/superstep.
- decision slot.
- selected model/provider/profile.
- model task class.
- allowed tool family.
- allowed output contract id/version.
- input byte count.
- input artifact ref/hash.
- commitment count.
- WorkIntent count.
- graph node/edge counts before call.
- active frontier counts.
- elapsed time.
- heartbeat age.
- output byte count.
- finish reason when available.
- native finish reason when available.
- choice count/content lengths when available.
- accepted tool call summary.
- rejected tool call summary.
- schema error path.
- policy error path.
- repair attempt number.
- raw-storage flags all false.

This envelope must be visible in owner readback while the model call is
running. It must not expose hidden reasoning or raw provider bodies.

### Slow-Call Handling

Long scheduler calls may be legitimate global reasoning. They still need
operator optics:

- what decision slot is running.
- what bounded contract is being filled.
- which tool family is allowed.
- how large the input is.
- whether heartbeat is fresh.
- whether output started.
- what schema/policy blocker occurred if rejected.

### Implementation Evidence 2026-05-25

The scheduler observability envelope is now implemented as a bounded runtime
contract:

- `SchedulerModelCallEnvelope` captures preflight, heartbeat, completion,
  rejection, and repair phases with scheduler iteration, superstep, decision
  slot, model/provider/profile, task class, reasoning/parser modes, allowed
  tool family, output contract, input/output byte counts, input/output hashes,
  commitment count, WorkIntent count, graph counts, active frontier counts,
  elapsed time, heartbeat count/age, finish reason, bounded provider response
  shape, accepted/rejected tool summaries, schema/policy paths, repair field
  hints, missing fields, rejected decision refs, and raw-storage flags.
- the dynamic scheduler model client emits envelope snapshots on live model
  progress events without storing hidden reasoning, raw prompts, raw responses,
  raw provider bodies, raw tool logs, raw DB rows, or secrets.
- scheduler rejection paths attach the same envelope to
  `scheduler.reject_staged_graph`, so owner readback shows the rejected
  decision id/kind, missing structural fields, schema/policy path, and repair
  hints instead of a generic needs-review marker.
- `scheduler.record_model_call_envelope` is registered as a bounded scheduler
  runtime tool family for model-call observability.
- latest-run-state and Work Queue active graph readback project the envelope
  with decision slot, scheduler phase, model/provider/profile, tool family,
  output contract, bytes, graph/frontier counts, heartbeat age, finish reason,
  provider shape summary, accepted/rejected tool summary, missing fields, and
  schema/policy paths.
- focused scheduler envelope/runtime-tool/no-semantic-cheat/latest-run-state
  and readback projection tests passed 29 tests, and scoped type validation
  passed.

## 7. Validation Phase Semantics

Validation must be phase-aware. A validation result is not generic proof of
success.

Canonical validation phases:

- `pre_proof_validation`
- `pre_execution_validation`
- `post_edit_validation`
- `review_validation`
- `closeout_validation`
- `diagnostic_validation`

Rules:

- `pre_proof_validation` can prove the harness/gateway/spec environment is
  ready. It cannot satisfy implementation commitments.
- `pre_execution_validation` can prove resources and commands are available.
  It cannot satisfy changed-file evidence.
- `post_edit_validation` can support implementation evidence only when tied
  to changed files, task ids, and commitment ids.
- `review_validation` supports review acceptance but cannot replace source
  edit evidence.
- `closeout_validation` supports finalization readiness only after evidence
  claims exist.
- `diagnostic_validation` is never a production success path.

Evidence claims must include `validationPhase`. Closeout and Mission Ledger
evaluation must reject phase-incompatible evidence instead of treating any
passing command as implementation success.

Implementation evidence, 2026-05-25:

- `validation-phase.ts` now defines the canonical phase enum and a runtime
  compatibility evaluator. It does not infer semantics from strings; it
  enforces compatibility between model-authored evidence kind, lifecycle phase,
  changed-file refs, validation refs, and node kind.
- `CommitmentEvidenceClaim` now carries validation phase, validation refs,
  changed-file refs, phase compatibility, and phase reason codes. Missing or
  invalid phases normalize to `diagnostic_validation`, which is non-closing.
- generic node execution results compute phase compatibility before deriving
  evidence classes, so phase-incompatible source/test claims cannot look like
  accepted implementation evidence.
- Mission Ledger evaluation receives only phase-compatible closure-capable
  claims. Artifact-only or diagnostic claims can remain visible in readback but
  cannot close commitments.
- scheduler review and throttle artifacts expose compatible/incompatible
  evidence counts, validation phases, compatibility states, and phase reason
  codes.
- non-Codex worker validation tools record `validationPhase`; post-edit
  structural validation is `post_edit_validation` only after changed-file refs
  exist, otherwise it remains diagnostic.
- implementation and closeout result producers emit `post_edit_validation` and
  `closeout_validation` respectively. Validation command refs are no longer
  conflated with validation phase requirements in resource materialization.
- Work Queue active graph projection and latest-run-state include validation
  phase compatibility fields for owner readback.

Focused proof:

- `workflow-node-execution.test.ts` proves post-edit evidence is accepted and
  pre-proof validation cannot satisfy source-change evidence.
- `runtime-work-graph-scheduler.test.ts` proves invalid or non-closing claims
  do not reach Mission Ledger closure.
- `node-resource-materialization.test.ts`, readback projection,
  latest-run-state, non-Codex worker loop, and no-semantic-cheats tests passed.
- scoped `pnpm tsgo:fast` passed.

## 8. Readback Gate Fix

`firstOpenGate` must be derived from canonical readiness/frontier state, not
stale checkpoint phase labels.

Readback gate inputs:

- active `NodeReadinessState`.
- active `BranchScopedFrontierState`.
- active `NodeExecutionContract`.
- active scheduler/model-call envelope.
- active blocker/root-cause artifact.
- validation phase state.
- closeout readiness state.

If materialization is blocked, `firstOpenGate` must say materialization is
blocked and show:

- branch id.
- node id.
- execution intent.
- capability.
- missing fields.
- reason codes.
- contract ref.
- readiness ref.
- schema/policy path.
- next legal transition.

It must not continue to show `commitment_work_packets` simply because that
was the last stale checkpoint gate label.

Implementation evidence, 2026-05-25:

- `canonical-readback-gate.ts` now defines the bounded
  `CanonicalReadbackGate` projection consumed by latest-run-state and Work
  Queue active graph readback.
- Work Queue `firstOpenGate` is now an alias of the canonical readback gate,
  so legacy readback field names cannot preserve stale checkpoint behavior as
  authoritative truth.
- The canonical gate chooses current runtime sources in precedence order:
  terminal adapter/runtime outcome, frontier root-cause/no-progress state,
  branch-scoped frontier state, readiness/resource blockers, scheduler
  frontier, latest-run-state, and only then explicit checkpoint fallback.
- Stale checkpoint fallback is visible and low-confidence. It cannot override
  current materialization, context, frontier, worker, validation, or closeout
  blockers.
- Materialization blockers expose branch id, node id, contract ref, readiness
  ref, missing fields, schema/policy path, reason codes, successful sibling
  evidence, consumer refs, and next legal transition.
- The latest-run-state and Work Queue readback projections now carry the same
  canonical gate and an agreement check for gate kind, node id, and readiness
  ref.
- The readback gate does not infer lifecycle from Product/Spec prose or
  substring checks. Exact manifest fields and registered runtime enums are the
  only deterministic inputs.

Focused proof:

- `readback-projections.test.ts` proves `firstOpenGate` reports
  `resource_materialization` for a materialization blocker even when the
  stale checkpoint label is `commitment_work_packets`.
- `latest-run-state.test.ts` proves terminal adapter state and branch-scoped
  blocker context are preserved in the canonical gate.
- `no-semantic-cheats.test.ts` proves readback gates do not use substring
  lifecycle classification.

## 9. Model Policy

Model policy attaches to task class and contract boundary.

Default:

- GPT-5.5 or equivalent high-reasoning lane:
  - global semantic architecture.
  - WorkIntent DAG quality review.
  - capability/sufficiency judgment for high-risk nodes.
  - structure review when graph topology affects many branches.
  - closeout acceptance.
- Qwen/fast local lanes:
  - bounded local context search and extraction.
  - schema normalization over small typed contracts.
  - context scout handoffs when packet is node-scoped.
  - validation classification.
  - simple evidence summaries.
- Kimi/patch lanes:
  - bounded edit authoring after accepted plan and hydrated snapshots.
  - no broad graph or scheduler decisions.

Runtime owns schema and lifecycle for all lanes. Fast models should receive
small typed contracts and handles, not internal DAG JSON or large global
state.

Proof mode must surface provider/model instability as diagnostic evidence.
Provider rescue may keep a workflow moving when explicitly allowed, but a
proof cannot silently call a boundary stable if the normal model policy
failed and a stronger lane rescued it without owner acceptance.

### Implementation Status

Implemented on 2026-05-25 as
`openclaw-convergence.contract-spine-09-model-policy-bindings`.

Runtime now defines exact model contract boundary bindings in
`extensions/execution-platform/src/model-tasks/model-task-classification.ts`.
Each binding is keyed by a canonical boundary id and carries:

- task class.
- exact call site.
- model policy ref.
- provider path.
- preferred model ref and explicit fallback model refs.
- reasoning mode.
- parser mode and response format mode.
- hard and soft timeout.
- max input bytes.
- max output tokens.
- retry policy.
- escalation policy.
- telemetry requirements.
- proof-cleanliness policy.
- allowed model-facing tool family.
- allowed output contract id/version.
- provider-call permission.
- raw-storage flags set to false.

Current canonical boundaries:

- `router_front_door`
- `mission_ledger_compile`
- `commitment_packet_semantic_content`
- `commitment_packet_targeted_normalization`
- `source_prompt_excerpt_interpretation`
- `work_intent_global_compile`
- `scheduler_global_reasoning`
- `scheduler_capability_selection`
- `scheduler_field_repair`
- `resource_requirement_compile`
- `context_scout_handoff`
- `resource_materialization`
- `implementation_patch_author`
- `worker_local_tool_selection`
- `validation_failure_classification`
- `validation_repair_plan`
- `evidence_summary`
- `closeout_acceptance`

The binding registry is intentionally exact-map based. Runtime may attach a
model policy to a declared boundary, validate that the declared boundary
matches its task class and call site, and reject provider calls or contract
settings that violate the binding. Runtime must not classify semantic intent
from prompt substrings, Product/Spec wording, artifact ref names, node titles,
or failure-message prose.

### Proof-Hardening Entry Status

The decomposed proof-hardening tranche through
`openclaw-convergence.proof-hardening-07-adversarial-entry-suite` is closed
from DB evidence. The adversarial entry suite now proves the contract spine can
fail safely on stale child replay, missing contract bodies, context repair
without requirement packets, over-budget target selection, limitation waiver
denial, rollback review hydration, sibling failure isolation, provider-route
mismatch, semantic lexical traps, a neutral non-coding domain fixture, and
capability-manifest default traps before the full Product/Spec proof starts.

The next DB-ranked item is
`openclaw-convergence.active-queue-34`, the Product/Spec Planning Workflow
Plugin Production Proof. That proof must use the contract spine as production
runtime authority: graph nodes schedule work, payload-backed contracts define
work, runtime validates structural authority, and models/humans own semantic
quality judgment.

### Binding Preflight

`evaluateModelPolicyBindingPreflight` produces a bounded diagnostic object for
every bound provider call. It checks:

- task class.
- model policy ref.
- provider path.
- reasoning mode.
- parser mode.
- response format.
- model ref allow-list.
- allowed tool family.
- allowed output contract id/version.
- requested timeout.
- soft timeout.
- requested output tokens.
- requested input bytes.
- runtime-only provider-call bans.
- rescue/escalation proof cleanliness.

Failures carry exact mismatch fields with expected/actual values and a reason
code. This is a structural preflight, not a semantic quality judge.

`resource_materialization` remains runtime-only. A provider call under that
class is a hard contract violation.

### Proof Cleanliness

Proof mode treats hidden rescue as forbidden and nonzero rescue/escalation as
proof concern unless the owner explicitly accepts the provider incident. The
workflow may continue when allowed by policy, but readback must expose:

- proof-cleanliness state.
- rescue count.
- escalation count.
- whether owner accepted the provider incident.
- reason codes.

This prevents GPT rescue, provider fallback, or stronger-lane escalation from
silently turning an unstable boundary into a clean proof.

### Readback And Telemetry

Scheduler model-call envelopes now carry:

- `contractBoundaryId`
- `modelPolicyBindingRef`
- `proofCleanlinessState`
- `proofCleanlinessReasonCodes`
- `policyMismatchFields`

Latest-run-state current progress and Work Queue active-graph readback project
the same fields, alongside model ref, provider path, task class, model policy
ref, reasoning mode, parser mode, allowed tool family, and output contract.
The projection remains bounded and raw-free: no raw prompt, raw response,
provider body, raw tool log, hidden reasoning, secret, or raw DB row is stored.

### Acceptance Evidence

Focused tests prove:

- every task class maps to an explicit production model policy.
- resource materialization cannot invoke a provider.
- contract boundaries bind exact task class, policy, model, tool family, and
  output contract.
- policy preflight blocks reasoning/tool/output/timeout/input mismatches.
- proof-mode rescue/escalation is visible and blocks clean proof without owner
  acceptance.
- scheduler model-call envelopes preserve boundary and proof-cleanliness
  fields without raw provider payloads.
- Work Queue/readback projects boundary, policy-binding, and proof-cleanliness
  fields owner-visibly.

## 10. Boundary Replay Requirements

Replay is a production boundary system, not a parallel proof harness that can
invent topology.

Required replay boundaries:

- after Commitment Work Packets.
- before WorkIntent compile.
- after WorkIntent compile.
- before ResourceRequirementPacket compile.
- after ResourceRequirementPacket compile.
- before context scout execution.
- after accepted context handoff.
- before resource materialization.
- after resource materialization.
- before worker invocation.
- after worker result.
- after validation.
- before closeout.

Replay must:

- load canonical payload refs.
- apply checkpoint normalizers only when semantically safe.
- refuse stale or unsupported checkpoint shape with exact missing refs.
- use production scheduler/path services.
- not inject context synthesis unless workflow/model contract explicitly
  requires it.
- write latest-run-state at every boundary.
- preserve walltime/token/provider diagnostics where available.

### Replay Diagnostic - 2026-05-25

Contract-spine item 10 replay from
`team-run-native-exec-12fa6ecec70ecb9a-runtime-work-graph` exposed two
distinct classes of issue.

Bug fixed in this pass:

- `scripts/execution-platform-run-product-spec-boundary-replay.mjs` rebuilt
  context supply summaries from artifact metadata only. The bounded
  `resource_handoff_packet` payloads contained model-authored
  `recommendedEditPoints`, `targetFileRefs`, and implementation summaries,
  but those fields were invisible to materialization when they lived in the
  payload body. Replay now hydrates context handoff payloads and merges richer
  handoff-backed model refs into the replay context summary before compiling
  resource packets.

Architecture/toolification deficiency catalogued, not patched around:

- the three source-edit implementation nodes still cannot materialize
  executable `NodeExecutionPacket`s because their scheduler-selected
  `targetRefs` are broad directory scopes that do not line up with the
  concrete file refs model-authored by context scouts in
  `recommendedEditPoints`.
- runtime correctly refuses to widen edit scope from context prose. It must
  not turn a context scout recommendation into executable authority unless a
  model-authored target-selection/contract-revision boundary explicitly
  accepts those concrete refs for the consumer node.
- the next architecture move is a first-class target-selection repair
  boundary, not deterministic scope guessing:

```text
implementation_context_packet(context_repair_required/select_concrete_target_files)
  -> implementation.select_target_files or work_intent.revise_target_scope
  -> runtime validates selected refs against candidates, authority, capability,
     WorkIntent, context requirement, and commitment mapping
  -> materialization reruns from the same boundary
```

This preserves the model/runtime boundary: models choose semantic target files
or target-scope revisions; runtime validates refs, shape, authority, bounds,
and lifecycle.

## 11. Required Work Block Before Next Full Proof

The next Product/Spec full proof must wait for these items.

1. Canonical `NodeExecutionContract` and split-child inheritance hardening.
2. `ResourceRequirementPacket` compiler and narrow context-scout tool path.
3. Demand-driven context enforcement and no-default-synthesis replay audit.
4. Frontier root-cause/no-progress collapse.
5. Branch-scoped readiness/frontier/readback projection.
6. Scheduler model-call observability envelope.
7. Validation phase semantics split.
8. Canonical readback gate from readiness/frontier state.
9. Model-policy binding for global reasoning vs bounded local execution.
10. Replay proof from completed packets and resource-materialization
    boundaries.

Only after those pass should the top-to-bottom Product/Spec proof run again.

## Acceptance Criteria

### Contract Spine

- Runtime defines `NodeExecutionContract` and stores full bodies in payload
  storage.
- Graph metadata is manifest-only and rejects contract bodies.
- Executable worker dispatch requires `NodeExecutionContract`,
  `NodeExecutionPacket`, and domain resource packet hydration.
- Split children inherit parent contract fields and can only narrow through
  safe override packets.
- Tests prove split children cannot drop `executionIntent`, `evidenceMode`,
  `capabilityId`, validation requirements, context requirements, or evidence
  requirements.

### Context Requirements

- WorkIntent cannot dispatch context scout directly without a compiled
  `ResourceRequirementPacket`.
- Context scouts receive `ContextScoutExecutionPacket`s with bounded refs and
  small verbs.
- Demand-driven context is per consumer/work-intent/file-resolved packet by
  default.
- Global synthesis is explicit coordination only.
- Accepted-with-limitations context unlocks only consumers with valid
  nonblocking waivers.

### Frontier And Readback

- Repeated sibling blockers collapse into one root-cause artifact.
- Successful sibling branch evidence survives failed siblings.
- Repair nodes carry consumers or are diagnostic-only.
- Work Queue readback shows branch id, node id, blocker, schema/policy path,
  readiness ref, contract ref, and next legal transition.
- `firstOpenGate` is derived from readiness/frontier state.

### Observability

- Scheduler/model calls emit preflight, heartbeat, completion, rejection, and
  repair envelopes.
- Owner readback shows decision slot, model/provider/profile, allowed tool
  family, input/output bytes, graph counts, elapsed time, heartbeat age,
  finish reason, accepted/rejected tool call summary, and schema error path.
- No hidden reasoning, raw prompts, raw provider bodies, raw logs, secrets,
  or raw DB rows are stored.

### Validation

- Evidence claims carry validation phase.
- Pre-proof validation cannot satisfy implementation success.
- Post-edit validation must map to changed files/task ids/commitment ids to
  support implementation evidence.
- Closeout rejects phase-incompatible evidence.

### Model Policy

- No deterministic semantic substring classifiers exist in scheduler,
  context compiler, packet compiler, router, or worker adapters.
- Model task class selects model profile, output contract, timeout, retry
  policy, and observability requirements.
- Runtime validates declared values and refs; it does not invent semantic
  values.

### Replay Proof

- Completed-packets replay compiles WorkIntents, context requirements, and
  context scout packets without context synthesis default glue.
- Resource-materialization replay proves split children preserve executable
  contracts.
- Repeated materialization blockers collapse rather than spin.
- One worker boundary proof either produces a bounded edit plus validation
  and evidence, or returns a precise upstream blocker.

## Code Areas To Review

Use `rg` if paths drift.

- `extensions/execution-platform/src/workflows/work-intent.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts`
- `extensions/execution-platform/src/workflows/runtime-node-readiness-state.ts`
- `extensions/execution-platform/src/workflows/node-resource-materialization.ts`
- `extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts`
- `extensions/execution-platform/src/workflows/context-broker.ts`
- `extensions/execution-platform/src/workflows/context-scout-execution-packet.ts`
- `extensions/execution-platform/src/workflows/action-review-artifacts.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/workflows/model-task*`
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- `extensions/execution-platform/src/work-queue/execution-read-model.ts`
- `extensions/execution-platform/src/work-queue/projections/*`
- `extensions/execution-platform/src/observability/latest-run-state.ts`
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`

## Required Tests

- Contract body cannot be stored in graph metadata.
- Graph node metadata remains under manifest bounds with large contracts.
- Split children inherit and narrow parent contract safely.
- ResourceRequirementPacket is required before context scout execution.
- Demand-driven context creates consumer-scoped scouts, not global blob
  scouts.
- Replay from completed packets does not inject context synthesis.
- Repeated sibling materialization blockers collapse into one root cause.
- Branch readback preserves successful sibling evidence when another sibling
  fails.
- `firstOpenGate` follows canonical readiness/frontier state.
- Validation phase semantics prevent pre-proof validation from satisfying
  implementation evidence.
- Scheduler observability envelope emits preflight/heartbeat/completion and
  schema rejection details without raw bodies.
- Action review artifacts are payload-backed, hydrateable, linked in
  readback, generic for non-coding domains, and specialized for coding worker
  edits without moving quality judgment into runtime.
- No-semantic-cheats regression covers scheduler, context compiler, packet
  compiler, router, and worker adapters.

## Proof Order

1. Focused contract spine tests.
2. Focused context requirement/scout packet tests.
3. Focused root-cause collapse and branch-readback tests.
4. Focused scheduler observability envelope tests.
5. Focused validation phase semantics tests.
6. Completed-packets replay proof.
7. Resource-materialization replay proof.
8. Worker boundary proof.
9. Top-to-bottom Product/Spec proof.

## Deep Completion Question

After implementation and code review, ask:

> Did we maximally implement the Execution Contract Spine, Context
> Requirements, And Frontier State architecture as a production runtime
> boundary, with payload-backed `NodeExecutionContract`s, safe split-child
> inheritance, required `ResourceRequirementPacket`s, demand-driven context,
> frontier root-cause collapse, branch-scoped readiness/readback, scheduler
> observability envelopes, validation phase semantics, canonical
> `firstOpenGate`, model-policy bindings, replay proofs from completed
> packets/resource materialization, and no fallback, compatibility,
> proof-only, body-in-metadata, Product/Spec-specific, or deterministic
> semantic-cheat paths left that can hide or fake executable readiness?

If the answer is not an unqualified yes, patch the missing production layer,
rerun focused validation and replay proof, update docs/readback artifacts,
and ask the question again.
