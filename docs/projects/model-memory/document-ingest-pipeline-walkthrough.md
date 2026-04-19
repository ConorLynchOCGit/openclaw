---
summary: "Exact stage map for the live document-ingest path from source adaptation through write and projection rebuild."
title: "Document Ingest Pipeline Walkthrough"
---

# Document Ingest Pipeline Walkthrough

This walkthrough records the live document-ingest path as implemented in the
current model-memory runtime.

It is written to support the rule-vs-fact benchmark work, so it focuses on:

- where `kind` is decided
- where `canonicalClass` is decided
- where objects can be dropped, merged, or rewritten
- where rule-shaped content can collapse into fact-shaped content

## Stage 1. Source adaptation and windowing

Files:

- `extensions/model-memory/src/source-adapters/document-source-adapter.ts`

Primary function:

- `adaptDocumentSource`

Input shape:

- `DocumentSourceInput`
  - `externalSourceId`
  - raw document `text`
  - optional `projectId`
  - optional `sourceMetadata`
  - optional `maxWordsPerWindow`
  - optional `sourceKind`

Output shape:

- `DocumentSourceEnvelope`
  - `source`
  - `normalizedText`
  - `windows[]`

Semantic commitments:

- none about memory meaning
- only structural normalization and chunking

What happens:

- text is normalized
- headings, paragraphs, and list items are converted into block descriptors
- windows are built from blocks using `maxWordsPerWindow`
- each window gets stable ids, heading paths, line ranges, and token estimates

Where objects can be dropped or hidden:

- nowhere semantically yet
- only chunk boundaries are set here

Where rule can collapse into fact:

- not here
- this stage can still influence later behavior indirectly if large windows mix
  descriptive and normative content together

## Stage 2. Candidate extraction

Files:

- `extensions/model-memory/src/document-ingestion.ts`
- `extensions/model-memory/src/semantic-extraction-prompt.ts`

Primary functions:

- `ingestDocument`
- `ingestSourceEnvelope`
- `buildSemanticCandidateExtractionPrompt`
- `buildSemanticCandidateExtractionRepairPrompt`

Input shape:

- one `DocumentSourceWindow`
- model id
- semantic interpreter

Output shape:

- raw interpreter result:
  - `{"action":"ignore"}`
  - or `{"action":"capture","objects":[candidate...]}` where each candidate has:
    - `candidateType`
    - `claim`
    - `supportingSpans`
    - `confidence`
    - `shouldStore`

Semantic commitments:

- this is the first place `kind` is effectively chosen
- the model chooses `candidateType`:
  - `preference`
  - `fact`
  - `rule`
  - `procedure`
  - `reference`
- `canonicalClass` is not decided yet

What happens:

- each window is sent to the candidate prompt
- the result is structurally validated against the candidate schema
- supporting spans are checked against real heading paths and line ranges
- candidates with `shouldStore=false` are dropped
- same-type same-claim duplicates are deduped within the window
- if the first candidate pass is malformed and produced zero accepted candidates
  with errors, a repair pass is attempted

Where objects can be dropped or hidden:

- malformed candidates fail schema or span validation
- low-value candidates may be omitted by the model
- duplicate same-type same-claim candidates are collapsed inside a window

Where rule can collapse into fact:

- this is the first major risk seam
- if the model classifies normative text as `fact` here, pass 2 cannot recover
  it because pass 2 is instructed to keep final kind aligned to `candidateType`

## Stage 3. Canonicalization

Files:

- `extensions/model-memory/src/document-ingestion.ts`
- `extensions/model-memory/src/semantic-extraction-prompt.ts`

Primary functions:

- `buildSemanticExtractionPrompt`
- `buildSemanticExtractionRepairPrompt`

Input shape:

- source window metadata
- accepted candidate list from stage 2

Output shape:

- raw interpreter result:
  - `{"action":"ignore"}`
  - or `{"action":"capture","objects":[canonicalObject...]}` where each object
    must include:
    - `canonicalClass`
    - `kind`
    - `payload`
    - `provenance`
    - `confidence`
    - `durability`
    - `reviewMode`
    - optional `scope`

Semantic commitments:

- this is where final `kind` is emitted
- this is also where the model currently chooses `canonicalClass`
- the prompt still enforces hard class-kind pairings

Current allowed pairings:

- `user + preference`
- `project + fact`
- `user | feedback | project + rule`
- `feedback + procedure`
- `reference + reference`

Where objects can be dropped or hidden:

- the model may omit candidates if it cannot express them under the final schema
- a repair pass runs only after malformed canonical objects produce repairable
  validation failures

Where rule can collapse into fact:

- if stage 2 already labeled a claim as `fact`, pass 2 preserves that skew
- if the model treats the rule payload grammar as too brittle, it may avoid
  rule-shaped output entirely by undercalling rule upstream
- the hard class-kind pairing means the model is deciding two coupled semantic
  labels at once instead of one

## Stage 4. Validation

Files:

- `extensions/model-memory/src/semantic-validator.ts`
- `extensions/model-memory/src/semantic-schema.ts`

Primary functions:

- `validateMemoryObject`
- `validateMemoryObjects`

Input shape:

- raw canonical object
- source-window validation context

Output shape:

- `accept`
- `reject`
- `reject_repairable`

Semantic commitments enforced here:

- final object must match one of the discriminated `kind` schemas
- rule payload requires:
  - `subject`
  - and at least one of:
    - `recommendedAction`
    - `avoidAction`
    - `neededCapability`
- fact payload only requires:
  - `subject`
  - `value`

Where objects can be dropped or hidden:

- malformed canonical objects are rejected
- heading path and provenance mismatches are rejected
- legacy excluded fields are rejected

Where rule can collapse into fact:

- this is the second major risk seam
- rule has a more brittle payload contract than fact
- a model that can express the idea but not the specific rule payload shape has a
  strong incentive to avoid rule output earlier in the pipeline

## Stage 5. Collision candidate selection

Files:

- `extensions/model-memory/src/db/database-memory-object-store.ts`
- `extensions/model-memory/src/semantic-identity.ts`

Primary functions:

- `DatabaseMemoryObjectStore.writeCapturedObjects`
- local collision gating helpers inside that class

Input shape:

- accepted canonical objects from stage 4
- existing stored memory objects

Output shape:

- zero-candidate direct distinct path
- deterministic attach-support fast path
- bounded-candidate adjudication requests

Semantic commitments:

- no new semantic extraction
- identity and slot comparisons are computed deterministically from the final
  object shape

Where objects can be dropped or hidden:

- not dropped, but possible merge candidates are constructed here

Where rule can collapse into fact:

- not by changing kind directly
- but rule-shaped objects can become less visible if their identity or slot
  lands near existing fact-heavy objects and later support attachment hides the
  new object as its own record

## Stage 6. Model-owned collision adjudication

Files:

- `extensions/model-memory/src/semantic-collision-adjudication.ts`
- `extensions/model-memory/src/db/database-memory-object-store.ts`

Primary functions:

- `ExecutorBackedSemanticCollisionAdjudicator`
- bounded adjudication path inside `DatabaseMemoryObjectStore`

Input shape:

- one new canonical object
- bounded candidate list of plausible prior objects

Output shape:

- `attach_support`
- `supersedes`
- `distinct`
- `conflict_hold`

Semantic commitments:

- this stage decides whether the new object should stay distinct or attach to a
  prior object

Where objects can be dropped or hidden:

- a distinct new rule can be hidden from later active counts if adjudication
  routes it to support attachment on a prior object instead of writing a new
  memory object

Where rule can collapse into fact:

- not by changing the object shape
- but by hiding a new rule as support on a preexisting fact-heavy memory object

## Stage 7. Write policy

Files:

- `extensions/model-memory/src/write-policy.ts`
- `extensions/model-memory/src/db/database-memory-object-store.ts`

Primary functions:

- `decideWritePolicy`
- `persistWriteDecision`

Input shape:

- canonical object
- identity descriptor
- existingByIdentity
- existingBySlot
- optional collision adjudication match

Output shape:

- `ignore`
- `attach_support`
- `write`
- `supersede`

Where objects can be dropped or hidden:

- non-durable objects are ignored
- duplicates attach support
- slot supersession writes a new object and marks the old one superseded

Where rule can collapse into fact:

- again, not by mutating kind
- but a rule can become less visible if attach-support routes it onto an
  existing target

## Stage 8. Runtime rebuild and projections

Files:

- `extensions/model-memory/src/live-document-ingestion-service.ts`
- `extensions/model-memory/src/runtime-rebuild-orchestrator.ts`
- `extensions/model-memory/src/runtime/projections/render-memory-md.ts`

Primary functions:

- `ingestDocumentLive`
- `rebuildDerivedRuntimeState`
- `renderMemoryMd`

Input shape:

- persisted memory objects and support items

Output shape:

- active slots
- active sets
- context artifacts
- workspace projection versions and rendered outputs

Semantic commitments:

- active slot and set materialization depend on the final stored object shape
- projections filter and format by class and kind

Where objects can be dropped or hidden:

- a stored object may exist but not materially affect `MEMORY.md`
- `renderMemoryMd` currently selects slot-backed records with canonical classes
  in `user`, `feedback`, or `project`, then formats facts, rules, and
  preferences into standing context and procedures into a separate section

Where rule can collapse into fact:

- not by mutation
- but projection visibility can make a rule-heavy ingestion look sparse if the
  stored shape does not materialize into the projection the way the operator
  expects

## Current benchmark conclusion target

For the current rule-vs-fact benchmark, the critical attribution seams are:

1. pass 1 candidate extraction
2. pass 2 canonicalization
3. validation of rule payload shape
4. collision/write hiding of otherwise valid rule objects

Those are the stages that must be measured separately. Final active counts alone
are not sufficient.
