---
summary: "Canonical intake decomposition architecture: full-prompt RequirementMap coverage, source-grounded requirements, and runner-owned native tool phases before scheduling."
title: "RequirementMap Intake Decomposition"
---

# RequirementMap Intake Decomposition

Date: 2026-06-03

Status: governing architecture for execution intake before the scheduler.

## Decision

The pre-scheduler intake path has one semantic owner and one semantic product.

```text
RouterStageRunner
  -> IntakeStageRunner
      -> SourcePromptArtifact
      -> RequirementMap
  -> SchedulerStageRunner
      -> SchedulerGraphPatch
  -> RuntimeGraphRepository
      -> RuntimeGraphNode / RuntimeGraphEdge
  -> NodeLifecycleTransitionRunner
```

`IntakeStageRunner` replaces separate pre-scheduler Mission Ledger,
ObligationGraph, DiscoveryBrief, and SchedulerIntakePacket authoring. Those
older products may appear only in historical docs, explicit negative tests, or
post-worker closeout code until closeout is migrated. They must not be live
pre-scheduler inputs.

The raw operator prompt remains the source of truth through
`sourcePromptBodyRef`. `RequirementMap` is a compact navigation and execution
map over that prompt, not a lossy rewrite of the prompt and not a discovery
seed store.

## Why This Exists

The old intake funnel asked several model calls to independently summarize,
classify, and repackage the same prompt. That created weak downstream signal,
duplicated schema, and repeated ownership leaks. The new shape is simpler:

- persist one bounded source prompt artifact;
- walk the whole prompt in bounded windows;
- extract source-anchored candidate requirements;
- consolidate candidates into final requirements;
- compile a compact `RequirementMap`;
- let downstream consumers reopen the prompt through their owning runner when
  they need more context.

Quality is expected to come from input and process, not from hard gates that
say "be good." Gates are still required, but they should be rare correctness
guards: coverage, source anchoring, native tool use, bounded storage, and
minimum fields needed by final consumers.

## Runner Ownership

`IntakeStageRunner` owns:

- source prompt artifact readiness;
- prompt window construction for RequirementMap extraction;
- which native tools are visible in each RequirementMap phase;
- parallel extraction dispatch across independent prompt windows;
- candidate consolidation;
- targeted repair of missing compact fields;
- deterministic compile and artifact persistence;
- RequirementMap replay checkpoint creation.

No other pre-scheduler component may author requirement meaning. Router may
route. Scheduler may schedule from an accepted map. Replay may hydrate an
accepted map. Readback may project accepted map status. None of those may
repair, reinterpret, or recreate RequirementMap semantics.

## Persisted Artifacts

Happy-path intake persists exactly:

- `execution_platform.source_prompt_artifact`
- `execution_platform.requirement_map`

There are no happy-path candidate artifacts, discovery brief artifacts,
obligation graph artifacts, mission ledger intake artifacts, or scheduler
intake packet artifacts. Intermediate candidates live only inside the bounded
runner loop and compact telemetry.

Artifacts must carry refs, hashes, counts, and bounded summaries. They must not
store raw prompts, raw model responses, raw provider logs, or raw tool logs.

## Minimal Schema

Persisted `RequirementMap` v2 is intentionally small. It is a source-grounded
requirement inventory, not an executable graph and not a worker discovery seed:

```ts
type RequirementMap = {
  artifactKind: "requirement_map";
  schemaVersion: "execution-platform.requirement-map.v2";
  mapId: string;
  mapRef: string;
  mapHash: string;
  sourcePromptBodyRef: string;
  sourcePromptHash: string;
  sourcePromptLength: number;
  requirements: Requirement[];
  coverage: RequirementCoverage;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

type Requirement = {
  requirementId: string;
  text: string;
  role:
    | "runnable_work"
    | "validation"
    | "review"
    | "closeout"
    | "constraint"
    | "non_goal"
    | "context";
  sourceRefs: string[];
};

type RequirementCoverage = {
  status: "complete";
  promptLength: number;
  windowCount: number;
  coveredWindowCount: number;
  candidateCount: number;
  requirementCount: number;
  retiredCandidateCount: number;
  coverageHash: string;
};
```

Runtime owns:

- ids;
- refs;
- hashes;
- offsets;
- coverage counts;
- artifact status;
- submit;
- default evidence modes derived from role.

The model authors only:

- candidate requirement text;
- evidence excerpts copied from visible prompt windows;
- final requirement text;
- role.

RequirementMap is not an acceptance-contract factory and not an executable
graph. Scheduler, workers, validation, review, and closeout derive
acceptance/evidence wording from requirement text and role inside their own
runner-owned phases. Scheduler owns graph grouping, aggregate mission tail
nodes, and exact dependency edges. Intake must not ask the model to author
dependency intent.

Removed from persisted RequirementMap:

- `sourceEvidence`;
- `evidenceContract`;
- `successCriteria`;
- `evidenceKinds`;
- `lexicalAnchors`;
- `lexicalAnchorRefs`;
- `schedulerRunnable`;
- `dependencyIntent`;
- empty authority, target-subject, and risk ref arrays;
- `discoveryBrief`;
- model-authored ids/status/hash fields;
- exact dependency ids;
- acceptance criteria / `doneWhen`;
- full prompt quotes;
- raw JSON drafts.

Scheduler may receive a projection that derives compatibility fields from role
defaults, but those are not model-authored RequirementMap fields and must not
be persisted as RequirementMap truth. RequirementMap roles are scheduler input,
not graph topology by themselves. Validation, review, and closeout roles are
real obligations, but they are not model-authored scheduler work units. The
`SchedulerGraphPatch` compiler covers them with aggregate mission tail nodes
unless explicitly deferred or blocked by a typed policy/human blocker. Context,
constraints, and non-goals are carried as metadata unless explicitly scheduled.
`SchedulerStageRunner` groups core requirements into minimal node seeds and
emits `SchedulerGraphPatch`:

```text
RequirementMap
  -> SchedulerGraphPatch
      -> nodeSeeds
      -> edges
      -> requirementCoverage
```

`SchedulerGraphPatch` compiler derives exact mission-tail ordering:

- runnable implementation/source work first;
- mission validation after relevant implementation/source work;
- mission review after implementation/source work and validation;
- mission closeout last.

Fresh scheduling must not route through WorkIntent graph-control nodes,
WorkIntent promotion, staged scheduler JSON drafts, or model-authored
`scheduler.submit_*` tools. The governing downstream scheduler spec is
`scheduler-graph-patch-runner.md`.

## Downstream Contract

Downstream consumers use `RequirementMap` differently:

- `SchedulerStageRunner` consumes all requirements and creates the compact
  runtime graph, including aggregate mission validation, review, and closeout
  tail nodes.
- `NodeLifecycleTransitionRunner` hydrates each node from persisted graph
  metadata and the covered RequirementMap refs; it must not require the old
  implementation/resource/materialization packet stack.
- Worker, validation, review, and closeout nodes reopen source prompt refs
  through their owning runner's prompt tools when they need more operator
  intent. Runtime provides mechanical search/open/hydration only.
- Closeout evaluates RequirementMap coverage and accepted evidence. Mission
  Ledger must not reappear as hidden pre-scheduler or final truth for this
  path.

## Native Tool Phases

All model interaction must use provider-native tool calls. JSON-shaped "tool
calls" are not accepted on the production path.

### Window Extraction

Owner: `IntakeStageRunner`

Parallelism: independent prompt windows may run in parallel Qwen sessions.

Visible tools:

- `requirement.record_candidate`
- `requirement.record_no_requirement`
- `source_prompt.expand_window`
- `source_prompt.open_adjacent`

Input: one bounded prompt window, objective hint, role guide, source prompt
body ref/hash, and window metadata.

The model must either record candidates anchored to excerpts copied from the
visible window or record that the window contains no operator requirement. If a
window is cut in the middle of an instruction, the model may request expansion
or adjacent text. Runtime performs only mechanical window changes; it does not
judge semantic relevance.

### Candidate Consolidation

Owner: `IntakeStageRunner`

Parallelism: cluster-local consolidation in parallel where candidate groups are
independent. A single global consolidation turn over all candidates is retired
as the default because it is slow, opaque, and easy to overload. A stronger
model may be used only for compact conflict escalation after local
consolidation, not as the normal full-prompt consolidation engine.

Visible tools:

- `requirement.merge`
- `requirement.split`
- `requirement.retire`
- `requirement.promote`

Input: candidate ids, candidate text, runtime-created source refs, source
window refs, no-requirement receipts, role guide, and cluster metadata. The raw
prompt is not provided to this phase. If a cluster lacks enough local context,
the runner may re-open bounded source prompt windows through source prompt
tools rather than pushing the whole prompt into consolidation.

The model should retire intake-process artifacts, merge duplicates, split
bundled candidates, and promote all real operator requirements in that cluster.
Runtime then performs structural merge of independent clusters. Only unresolved
cross-cluster duplicates or contradictions may enter a final compact conflict
pass.

### Requirement Repair

Owner: `IntakeStageRunner`

Parallelism: bounded targeted repair only.

Visible tools:

- `requirement.set_role`
- `requirement.attach_source_ref`

Input: promoted requirements, typed missing fields, blockers, and known source
refs. The model repairs missing compact fields only. It cannot redraft the map.

### Deterministic Compile

Owner: `IntakeStageRunner`

Runtime compiles the final map when:

- every prompt window is covered by an anchored candidate or no-requirement
  receipt;
- at least one requirement is promoted;
- every promoted requirement has text, role, and source refs;
- promoted requirements are not runtime-process artifacts such as "produce a
  RequirementMap";
- no raw prompt/response/provider/tool storage flag is true.

Runtime submits after compile. The model never calls `requirement.submit`.

## Prompt Windowing

RequirementMap extraction windows are mechanical, bounded, overlapping views of
the source prompt. They are not semantic summaries. The window builder prefers
natural boundaries when possible, but a model may still ask to expand or open
adjacent text when a sentence, list item, or code block is incomplete.

The coverage unit is the original planned prompt window. Expanded or adjacent
reads are a way to understand and anchor that unit, not a new persisted intake
artifact.

## Consumer Prompt Access

The scheduler, workers, and closeout receive:

- `sourcePromptBodyRef`;
- requirement ids/text/roles;
- requirement source refs.

If that is insufficient, the consumer calls prompt/context tools through its
own canonical runner:

- scheduler uses `SchedulerStageRunner` tools for ambiguous grouping,
  capability, or dependency planning;
- workers use `NodeLifecycleTransitionRunner`-owned prompt/repo context tools;
- closeout uses closeout-owned prompt/evidence readback tools.

Consumers do not ask intake to precompute lexical anchors or discovery seeds.
They ground their own local task against the prompt because they know what they
are trying to do.

## Scheduler Handoff

Scheduler consumes a bounded projection derived from RequirementMap:

- implementation requirements become executable work-unit candidates;
- validation/review/closeout requirements become compiler-covered mission tail
  requirements, not model-authored work-unit candidates;
- constraints and non-goals constrain work but are not standalone worker nodes;
- context requirements may become source-grounding work only when scheduler
  needs explicit grounding before execution.

Exact dependency edges among core work units belong to `SchedulerStageRunner`,
not RequirementMap. Mission-tail dependency edges belong to
`SchedulerGraphPatch` compiler. RequirementMap carries no dependency intent.
`SchedulerStageRunner` derives scheduler-visible core requirements from
requirement role/kind and authors exact ordering through its own runner-owned
dependency phase.

## Completion Gates

This architecture is complete only when:

- source prompt artifact is resolved before RequirementMap on long-prompt
  execution jobs;
- RequirementMap extraction covers the full prompt;
- every requirement has runtime-created source refs;
- no model-authored ids/refs/hashes/status fields enter the persisted map;
- native provider tools are used instead of JSON-shaped tool calls;
- no production pre-scheduler path imports or persists Mission Ledger,
  ObligationGraph, DiscoveryBriefSet, SchedulerIntakePacket, or old
  CommitmentWorkPacket intake products;
- scheduler receives RequirementMap projection, not raw prompt fallback or
  mission ledger counts;
- replay hydrates accepted RequirementMap artifacts instead of reauthoring
  requirement semantics;
- tests delete old expectations instead of preserving zombie fixtures.

## Retired Live Concepts

The following are retired as live pre-scheduler products:

- Mission Ledger authoring;
- ObligationGraph authoring;
- DiscoveryBriefSet authoring;
- SchedulerIntakePacket semantic authoring;
- RequirementMap v1 `requirement.add_batch`;
- RequirementMap v1 `requirement.fill_details_batch`;
- `sourceEvidence`;
- `evidenceContract`;
- intake-level lexical anchors/discovery seeds.

Historical docs and post-worker closeout migration code may still mention some
of these terms until those areas are explicitly migrated. They must not be
reachable from the fresh router-to-scheduler intake path.
