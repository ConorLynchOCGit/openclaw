# Family Definition Registry

## Purpose / problem

The current memory system has one product direction but too many
family-specific implementation branches. Family policy is currently spread
across:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/prompt-section.ts`
- `extensions/memory-middleware/src/proof-runner.ts`
- family-specific semantic, lifecycle, and phrase files

That structure was acceptable while proving the first six families. It is not
acceptable if the next 10+ families land on the same branch-heavy substrate.

This spec defines one declarative registry that becomes the canonical source of
family policy for ingestion, lifecycle, correction, retrieval, application,
semantic routing, and proof inspection.

## Why this is needed now

The six currently landed families are at practical parity, but the repo still
encodes them as partly separate systems. Without a registry:

- every new family requires touching multiple runtime seams
- behavior differences are encoded as branches instead of policy
- the retrieval layer keeps growing a family-specific scoring forest
- proofing and prompt shaping keep drifting into hidden application policy

Flattening must start by giving the system one place to declare what a family
is and how it should behave.

## Current parallel systems this replaces or reduces

- ordered family chains in `ordinary-turn-auto-capture.ts`
- separate managed-resolution paths in `candidate-submit.ts`
- family-specific lifecycle inspection selection in `proof-runner.ts`
- family-specific retrieval ranking assumptions in `db/queries.ts`
- prompt-section policy branches that depend on family name instead of family
  contract

## Architecture fit

The family-definition registry is the control plane for the flattening phase.

It does not replace:

- the existing candidate/review/promotion substrate
- approved-only hybrid retrieval
- family-specific product policy where that policy is real

It does replace:

- accidental duplication of family policy across multiple code paths

Other flattening specs depend on this registry:

- `/memory-system/specs/unified-ingestion-resolver`
- `/memory-system/specs/unified-clustered-lifecycle`
- `/memory-system/specs/unified-correction-and-supersede`
- `/memory-system/specs/unified-phrase-pattern-engine`
- `/memory-system/specs/retrieval-feature-framework`
- `/memory-system/specs/behavior-profile-layer`
- `/memory-system/specs/registry-driven-proof-inspection`

## Domain model

### Registry scope

The registry defines policy for every durable content family that can enter the
memory system.

The initial flattening target is the six landed families:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

Later families must also be added through this registry rather than by adding a
new branch chain.

### Proposed registry shape

```ts
type MemoryFamilyId =
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "workflow_lesson"
  | "project_rule"
  | "unmet_need";

type StorageKind =
  | "memory_object"
  | "procedure_candidate"
  | "validated_procedure"
  | "phrase_pattern";

type ScopeModel =
  | { kind: "global" }
  | { kind: "project"; projectRequired: boolean }
  | { kind: "session"; sessionRequired: boolean };

type CanonicalField =
  | "scope"
  | "subject"
  | "value"
  | "recommended_action"
  | "avoid_action"
  | "needed_capability"
  | "guidance_pattern"
  | "procedure_title"
  | "procedure_steps"
  | "rationale";

type LifecycleMode = "bounded_auto_confirm" | "clustered_hold_auto_review" | "procedure_validation";

type CorrectionMode = "none" | "held_correction" | "immediate_supersede_when_targeted";

type PhraseMode = "unsupported" | "approved_pattern_reviewed";

type RetrievalMode =
  | "approved_hybrid"
  | "validated_procedure_hybrid"
  | "approved_hybrid_with_semantic_gate";

type ApplicationMode =
  | "shape_reply"
  | "guidance_only"
  | "recommendation_only"
  | "suggestion_first"
  | "direct_answer";

type SemanticRoutingMode = "disabled" | "family_gated_approved_only" | "validated_procedure_only";

type ProofMode = "memory_object_lifecycle" | "procedure_lifecycle" | "phrase_pattern_lifecycle";

type MemoryFamilyDefinition = {
  id: MemoryFamilyId;
  displayName: string;
  storageKinds: StorageKind[];
  scopeModel: ScopeModel;
  canonicalFields: CanonicalField[];
  typedFastPaths: string[];
  lifecyclePolicy: {
    mode: LifecycleMode;
    clusterKeyFields: CanonicalField[];
    subjectKeyFields: CanonicalField[];
    approvalThreshold: number;
    staleWindowDays: number;
  };
  correctionPolicy: {
    mode: CorrectionMode;
    targetFields: CanonicalField[];
    explicitCorrectionRequired: boolean;
  };
  phrasePolicy: {
    mode: PhraseMode;
    sourceStorageKind?: StorageKind;
    approvalStorageKind?: StorageKind;
  };
  retrievalPolicy: {
    mode: RetrievalMode;
    featureSet: string[];
    directIntentClass?: "fact" | "rule" | "need" | "procedure" | "style";
    suppressAdjacentFamilies?: boolean;
  };
  applicationPolicy: {
    mode: ApplicationMode;
    guidanceOnly: boolean;
    directUseOnlyOnClearAsk: boolean;
    promptSection: "behavior" | "project" | "procedure";
  };
  semanticRoutingPolicy: {
    mode: SemanticRoutingMode;
    enabledQueryClasses: string[];
  };
  proofPolicy: {
    mode: ProofMode;
    lifecycleInspector: string;
    phraseInspector?: string;
  };
};
```

### Example registry entries

#### Response style

- storage kind: `memory_object` plus optional `phrase_pattern`
- scope: global
- lifecycle: clustered hold auto-review for generic lanes; bounded auto-confirm
  for supported typed lanes
- correction: immediate supersede when the approved subject is directly targeted
- phrase: approved reviewed patterns are allowed
- application: `shape_reply`

#### Project facts

- storage kind: `memory_object`
- scope: project
- lifecycle: typed fast paths plus clustered hold auto-review for the bounded
  generic reference-fact lane
- correction: immediate supersede when a concrete fact target is resolved
- phrase: unsupported for now
- application: `direct_answer`

#### Recurring procedures

- storage kinds: `procedure_candidate`, `validated_procedure`
- scope: project when available, otherwise broader repo-local scope
- lifecycle: procedure validation remains distinct
- correction: immediate supersede only for same checklist/procedure identity
- phrase: unsupported for now
- application: `suggestion_first`

## Current-state pain points anchored to the repo

### Capture routing is still branch-heavy

`ordinary-turn-auto-capture.ts` runs a family-ordered chain rather than asking
one registry which families are eligible for a given source.

### Tool-side candidate resolution is still duplicated

`candidate-submit.ts` repeats family-specific resolution logic rather than
reusing the same resolved family contract as transcript capture.

### Retrieval policy is hardcoded by family

`db/queries.ts` contains family-specific ranking and direct-intent logic that
cannot scale to another 10+ families without becoming unmaintainable.

### Proof inspection is family-switched

`proof-runner.ts` still decides how to inspect a family using explicit
family-name branching.

## Proposed contracts and interfaces

### Registry module

Create one registry module in `memory-middleware` that exports:

- the concrete `MemoryFamilyDefinition[]`
- lookup by family id
- lookup by capture class
- lookup by storage kind
- lookup by proof mode

### No hidden policy rule

If a runtime seam needs family policy, it must query the registry. It must not
duplicate the same decision with a second family-name branch.

### Versioning rule

Policy fields may evolve additively, but families must not silently change
meaning without a corresponding spec and migration note.

## What remains family policy instead of becoming generic

The registry does not erase these differences:

- procedures remain `suggestion_first` and `direct_use_only_on_clear_ask`
- project facts remain stricter and explicit
- response style remains bounded rather than broad personality memory
- semantic routing remains family-gated rather than universal
- phrase induction remains allowed only for families that fit the reviewed
  artifact model

## Rollout posture

Roll out the registry before or alongside the first flattening implementation
slice. The first slice should move read-only policy consumers onto the registry
before deleting older branch logic.

## Proof / evaluation requirements

The first registry slice must prove:

1. existing family behavior is preserved for all six landed families
2. at least two separate runtime seams read the same family policy from the
   registry rather than from duplicated branches
3. proof output can show which registry entry governed the behavior

## Risks / failure modes

- registry becomes too abstract and stops reflecting real product policy
- runtime code keeps reading old branches and the registry becomes stale
- family differences get flattened that should have remained policy
- a single registry entry grows so wide that it becomes another hidden branch
  system

## Out of scope

- adding new families
- enabling self-improving capture
- enabling learned-guidance advisory planning
- making semantic routing universal
- changing production behavior in this spec-only slice

## Follow-up implementation slices

1. introduce the concrete registry and move static family policy into it
2. move ingestion selection onto registry-driven family eligibility
3. move proof inspection and retrieval planning to registry-driven lookup
