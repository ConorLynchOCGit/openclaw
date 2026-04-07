# Retrieval Feature Framework

## Purpose / problem

Retrieval policy is one of the biggest scaling risks in the current memory
system. `extensions/memory-middleware/src/db/queries.ts` already contains a
growing family-specific scoring forest for:

- response style
- project facts
- workflow lessons
- project rules
- unmet needs
- direct named-project intent shaping

That approach will not scale to 10+ more families.

This spec defines a shared retrieval feature framework that preserves the
current safety and quality rules while replacing family-specific scoring sprawl
with structured feature composition.

## Why this is needed now

Before more families are added, retrieval needs one explicit model for:

- feature extraction
- family feature selection
- scoring composition
- suppression of adjacent irrelevant families

Without that layer, every new family will require more direct SQL branching.

## Current parallel systems this replaces or reduces

- family-specific CASE ranking logic in `db/queries.ts`
- family-specific matched-field reporting rules
- ad hoc direct named-project intent boosts
- prompt-side suppression of adjacent irrelevant memories

## Architecture fit

The framework keeps:

- approved-only retrieval
- typed exact wins
- hybrid-first posture
- family-gated semantic routing

It changes:

- how ranking features are expressed and composed

## Current-state pain points anchored to the repo

- typed and generic families use different hand-authored ranking rules
- direct named-project intent shaping exists, but it is encoded as bespoke SQL
  branches
- matched-field reporting is tied to family-specific score logic

## Domain model

### Query intent

```ts
type RetrievalIntent =
  | "direct_fact_lookup"
  | "project_rule_lookup"
  | "unmet_need_lookup"
  | "workflow_guidance_lookup"
  | "procedure_lookup"
  | "response_style_lookup"
  | "generic_context_lookup";
```

### Shared retrieval features

```ts
type RetrievalFeature =
  | "typed_exact_match"
  | "project_scope_match"
  | "subject_match"
  | "value_match"
  | "recommended_action_match"
  | "avoid_action_match"
  | "needed_capability_match"
  | "guidance_pattern_match"
  | "procedure_title_match"
  | "family_intent_match"
  | "trigram_similarity"
  | "fts_search_document";
```

### Family retrieval policy

```ts
type FamilyRetrievalPolicy = {
  familyId: string;
  retrievalMode: "approved_hybrid" | "validated_procedure_hybrid";
  featureWeights: Partial<Record<RetrievalFeature, number>>;
  directIntentClass?: "fact" | "rule" | "need" | "procedure" | "style";
  matchedFieldPrefix?: string;
  suppressAdjacentFamiliesOnDirectHit: boolean;
  approvedOnly: true;
};
```

## Proposed contracts and interfaces

### Feature computation layer

Compute shared features once per candidate row:

- typed fast-path match
- scope overlap
- subject overlap
- value/action/capability overlap
- family-intent match
- text similarity features

### Scoring composition layer

Compose score from:

- shared feature values
- family policy weights from the registry
- query intent

### Query-plan rule

Move away from a single growing CASE forest by:

1. computing normalized query intent and feature inputs up front
2. generating family-specific feature columns from one feature set
3. composing scores with family policy rather than family-specific SQL branches

This can still live in SQL-backed retrieval, but the family policy must no
longer be hand-inlined per family.

## Required preserved behavior

### Exact typed wins

Typed explicit fields must still outrank generic overlap when the query is a
direct typed ask.

### Family-aligned direct-project intent shaping

Direct named-project asks must still prefer:

- project facts for fact-like asks
- project rules for operating guidance asks
- unmet needs for missing-support asks

### Project scoping

Project-scoped matches must still beat unscoped near-text matches where the
project is explicit.

### Approved-only behavior

Candidate retrieval must remain excluded from normal user-facing behavior.

## What remains family policy instead of becoming generic

- feature weights
- intent class eligibility
- adjacent-family suppression behavior
- semantic-routing eligibility

## Rollout posture

Land the feature framework before any broader family expansion. Migrate one
family group at a time, starting with the existing direct named-project
families whose current ranking logic is most obviously duplicated.

Current live rollout:

- `extensions/memory-middleware/src/retrieval-feature-framework.ts` now builds
  approved-memory hybrid score clauses and matched-field clauses from
  registry-defined retrieval policy
- `extensions/memory-middleware/src/memory-family-registry.ts` now stores
  registry retrieval weights and matched-field prefixes for response style,
  project facts, workflow lessons, project rules, and unmet needs
- `extensions/memory-middleware/src/db/queries.ts` now consumes that shared
  composer for approved-memory hybrid ranking
- typed exact/template/field/lesson boosts remain explicit fast paths
- candidate retrieval and validated-procedure retrieval still retain narrower
  legacy scoring seams

## Proof / evaluation requirements

Prove:

1. typed exact wins are preserved
2. project fact / project rule / unmet-need intent shaping still works
3. matched-field evidence remains explicit
4. one shared feature computation path serves more than one family

## Risks / failure modes

- feature framework becomes too generic and obscures why one family ranks above
  another
- adjacent-family suppression removes useful corroborating context
- typed wins regress under generic overlap weights

## Out of scope

- semantic retrieval as the default
- candidate retrieval broadening
- family expansion

## Follow-up implementation slices

1. migrate the remaining reviewable-candidate retrieval scoring onto the same
   framework where honest
2. reconcile validated-procedure retrieval with the shared feature model
3. align behavior-profile selection with the same family retrieval policy
