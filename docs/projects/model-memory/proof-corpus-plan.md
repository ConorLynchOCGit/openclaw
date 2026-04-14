---
summary: "Initial audited proof corpus and acceptance bar for model-memory."
title: "Model Memory Proof Corpus Plan"
---

# Model Memory Proof Corpus Plan

## Objective

Lock the first audited proof corpus before runtime implementation starts.

This document remains the baseline proof contract.

Post-slice-15 expansion of proof for larger sources now starts from
[Large Document Ingestion Inventory](/projects/model-memory/document-ingestion-inventory)
rather than from ad hoc document picks.

## Large-source expansion status

Tier 1 large-document execution was run on 2026-04-14 against:

- `AGENTS.md`
- `docs/help/testing.md`
- `docs/gateway/configuration.md`
- `docs/gateway/protocol.md`
- `docs/projects/model-memory/specs/database-schema-v1.md`
- `docs/projects/model-memory/proof-corpus-plan.md`

Execution now uses:

- the live `model-memory` document-ingestion path
- the database-backed write and rebuild path
- explicit small-model extraction lane
- current model ref `openrouter/openai/gpt-5.4-nano`
- structural windowing with `maxWordsPerWindow = 1500`
- evidence artifact:
  [Large Document Tier 1 Evidence](/projects/model-memory/evidence/large-document-tier1)

Current honest result:

- zero Tier 1 large-source cases are admitted into the audited proof set yet
- the prior zero-capture and rejection-only state has materially improved
- all six Tier 1 documents now persist canonical objects with structured
  provenance
- however, rerunning the same Tier 1 documents still creates new writes rather
  than clean duplicate collapse, so the large-source proof set is still not
  ready for admission

Current blocker classes still seen in Tier 1 evidence:

- rerun instability:
  - the same Tier 1 source produces new writes on the second run instead of
    clean dedupe/supersession
- over-capture / source-sensitivity:
  - `AGENTS.md` remains bootstrap-preservation-sensitive and still captures
    repo-operating rules that are not automatically admissible into audited
    proof
  - `docs/projects/model-memory/proof-corpus-plan.md` remains
    proof-fixture-contamination-sensitive and captures content from the proof
    plan itself
- proof admission remains blocked until at least one real-source case is both
  structurally valid and rerun-stable

Implication:

- the real-source proof set must not be expanded by force
- no Tier 1 case is admitted automatically just because it now persists objects
- the next pass must improve rerun stability and duplicate identity quality,
  then explicitly adjudicate whether any Tier 1 case is honest enough for proof
  admission

## Representative pass-1 comparison status

On 2026-04-14, a bounded representative comparison was run before paying for
another broader Tier 1 sweep:

- representative sources:
  - `docs/help/testing.md`
  - `docs/gateway/protocol.md`
- fixed request seed:
  - `7`
- control lane:
  - pass 1 = `openrouter/openai/gpt-5.4-nano`
  - pass 2 = `openrouter/openai/gpt-5.4-nano`
- comparison lane:
  - pass 1 = `openrouter/openai/gpt-5-mini`
  - pass 2 = `openrouter/openai/gpt-5.4-nano`
- evidence artifact:
  [Representative Pass-1 Model Comparison](/projects/model-memory/evidence/representative-pass1-model-comparison-seed7)

Current honest result:

- pass-1-on-mini improved coarse representative outcomes:
  - `docs/help/testing.md` held captured-object count at `9 / 9` instead of
    `9 / 7`
  - `docs/gateway/protocol.md` avoided the nano reject path and held at
    `9 / 8` instead of `0 / 6`
- but the candidate sets themselves still drifted materially under the same
  seed:
  - `docs/help/testing.md` candidate overlap stayed near zero
  - `docs/gateway/protocol.md` candidate overlap stayed at zero
- canonicalization still drifted after the pass-1 upgrade because unstable
  candidates continued to feed pass 2
- therefore:
  - no real-source proof cases are admitted from this comparison sprint
  - no broader Tier 1 rerun was justified from this comparison sprint
  - the next honest blocker remains candidate-layer determinism, not proof
    admission policy

## Corpus design rules

- use local case data only
- use inert synthetic tokens rather than repo lore
- compare expected structured objects, not rendered statements
- include expected omissions, duplicates, and supersession cases
- every v1 case below is adjudicated now; implementation must conform to the case, not redefine it

## Adjudication rules

- all accepted cases expect `confidence = strong`
- all accepted cases expect `durability = durable`
- all accepted cases expect `reviewMode = auto_accept`
- duplicate and supersession cases are evaluated after prior prerequisite cases have already been written
- the canonical fixture text below is the default v1 fixture text and should be used verbatim unless a case-specific proof test is explicitly documenting equivalent alternate wording

## Document corpus

### `doc-001-user-preferences`

Source shape:

- one short document containing a stable user preference scoped to `user-001`
- canonical fixture text:

```text
User profile for user-001:
- Keep answers concise.
```

Expected:

- one object:
  - `canonicalClass = user`
  - `kind = preference`
  - `payload.subject = response style`
  - `payload.instruction = keep answers concise`
  - `payload.operation = prefer`
  - `scope.userScope = user-001`

### `doc-002-project-facts`

Source shape:

- one short document containing one durable scoped project fact
- canonical fixture text:

```text
Project notes for project-001:
- Deployment region: region-001.
```

Expected:

- one object:
  - `canonicalClass = project`
  - `kind = fact`
  - `payload.subject = deployment region`
  - `payload.value = region-001`
  - `scope.projectId = project-001`
  - `scope.projectScope = project-001`

### `doc-003-standing-rule`

Source shape:

- one short document containing one durable standing rule with `recommendedAction` and `avoidAction`
- canonical fixture text:

```text
Operating rule for project-001:
- Use gate-command-001 before landing.
- Do not use manual-command-001 for that step.
```

Expected:

- one object:
  - `canonicalClass = feedback`
  - `kind = rule`
  - `payload.subject = landing gate`
  - `payload.recommendedAction = use gate-command-001 before landing`
  - `payload.avoidAction = use manual-command-001 for that step`
  - `scope.projectId = project-001`
  - `scope.projectScope = project-001`

### `doc-004-procedure`

Source shape:

- one short procedure/checklist document
- canonical fixture text:

```text
Checklist procedure-001:
1. Run check-001.
2. Record artifact-001.
```

Expected:

- one object:
  - `canonicalClass = feedback`
  - `kind = procedure`
  - `payload.title = procedure-001`
  - `payload.steps = [run check-001, record artifact-001]`

### `doc-005-reference`

Source shape:

- one short routing/reference note
- canonical fixture text:

```text
When working on task-001, start with resource-001 and then consult resource-002 if needed.
```

Expected:

- one object:
  - `canonicalClass = reference`
  - `kind = reference`
  - `payload.task = task-001`
  - `payload.primaryResource = resource-001`
  - `payload.companionResources = [resource-002]`

### `doc-006-ignore`

Source shape:

- ephemeral or chatty content with no durable memory
- canonical fixture text:

```text
Status chatter:
- Thanks
- Sounds good
- Talk later
```

Expected:

- omission

## Ordinary-turn corpus

### `turn-001-explicit-preference`

Canonical fixture text:

```text
Please keep explanations high level by default.
```

Expected:

- one object:
  - `canonicalClass = user`
  - `kind = preference`
  - `payload.subject = response detail`
  - `payload.instruction = keep explanations high level`
  - `payload.operation = prefer`

### `turn-002-explicit-fact`

Canonical fixture text:

```text
For project-001, the deployment region is region-001.
```

Expected:

- one object:
  - `canonicalClass = project`
  - `kind = fact`
  - `payload.subject = deployment region`
  - `payload.value = region-001`
  - `scope.projectId = project-001`
  - `scope.projectScope = project-001`

### `turn-003-explicit-rule`

Canonical fixture text:

```text
Before landing in project-001, use gate-command-001 and do not use manual-command-001 for that step.
```

Expected:

- one object:
  - `canonicalClass = feedback`
  - `kind = rule`
  - `payload.subject = landing gate`
  - `payload.recommendedAction = use gate-command-001 before landing`
  - `payload.avoidAction = use manual-command-001 for that step`
  - `scope.projectId = project-001`
  - `scope.projectScope = project-001`

### `turn-004-explicit-procedure`

Canonical fixture text:

```text
Procedure-001 is: first run check-001, then record artifact-001.
```

Expected:

- one object:
  - `canonicalClass = feedback`
  - `kind = procedure`
  - `payload.title = procedure-001`
  - `payload.steps = [run check-001, record artifact-001]`

### `turn-005-explicit-reference`

Canonical fixture text:

```text
For task-001, start with resource-001 and consult resource-002 if needed.
```

Expected:

- one object:
  - `canonicalClass = reference`
  - `kind = reference`
  - `payload.task = task-001`
  - `payload.primaryResource = resource-001`
  - `payload.companionResources = [resource-002]`

### `turn-006-no-durable-memory`

Canonical fixture text:

```text
Thanks, that looks good for now.
```

Expected:

- omission

### `turn-007-duplicate`

Canonical fixture text:

```text
For project-001, the deployment region is region-001.
```

Expected:

- prerequisite: `turn-002-explicit-fact` is already written
- no new canonical object
- duplicate write-path decision
- same `identityKey` as `turn-002-explicit-fact`

### `turn-008-supersession`

Canonical fixture text:

```text
Correction for project-001: the deployment region is region-002.
```

Expected:

- prerequisite: `turn-002-explicit-fact` is already written
- one new canonical object
- prior same-slot object superseded deterministically
- replacement object:
  - `canonicalClass = project`
  - `kind = fact`
  - `payload.subject = deployment region`
  - `payload.value = region-002`
  - `scope.projectId = project-001`
  - `scope.projectScope = project-001`
- one supersession link from the prior `deployment region = region-001` fact to the new `deployment region = region-002` fact

## Acceptance bar

### Extraction acceptance

- schema-valid output
- correct canonical class
- correct kind
- normalized payload matches adjudicated expectation
- normalized scope matches adjudicated expectation
- provenance is structurally valid
- expected omissions remain omitted

### Write-path acceptance

- exact normalized duplicates dedupe
- same-slot deterministic supersession behaves as specified
- v1 write-policy override behavior is respected

### No-go acceptance

The proof set fails if correctness depends on:

- exact rendered statement match
- keyword triggers
- compatibility categories
- hidden rationale text

## Corpus size target for v1

Minimum starting set:

- 6 document cases
- 8 ordinary-turn cases

This is enough to lock the contract before implementation without pretending to be a full production benchmark.

## Implementation note

The first proof fixtures should live beside the tests that use them.

Do not create a shared fake-memory universe.

Before a reusable proof harness exists, slice-owned tests should embed these cases as local audited fixtures.
