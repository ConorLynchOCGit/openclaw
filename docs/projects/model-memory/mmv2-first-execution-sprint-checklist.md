---
summary: "Decision-complete checklist for the first MMV2 document-ingest shadow implementation sprint."
title: "MMV2 First Execution Sprint Checklist"
---

# MMV2 First Execution Sprint Checklist

## Objective

Land the first real MMV2 implementation slice as a document-ingest-only shadow
lane inside `extensions/model-memory/` without mutating the live v1 write path.

This sprint is successful only if it produces:

- a runnable MMV2 document shadow pipeline
- exact per-phase schema validation and repair seams
- a replayable proof lane over a bounded document corpus
- focused tests proving provenance fidelity, composite capture, and
  preference-versus-directive separation

This sprint is not successful if it:

- rewires ordinary-turn capture to MMV2
- replaces the live v1 runtime
- writes directly into the live active durable-memory tables
- handwaves missing phases behind one giant prompt

## Existing live seams this sprint must respect

These files define the current live v1 path and should be treated as reference
truth, not as the implementation target for in-place mutation:

- `extensions/model-memory/src/document-ingestion.ts`
  - `ingestDocument(...)`
  - `ingestSourceEnvelope(...)`
- `extensions/model-memory/src/ordinary-turn-capture.ts`
  - `captureOrdinaryTurn(...)`
- `extensions/model-memory/src/semantic-schema.ts`
  - `MemoryKindSchema`
  - `ModelMemoryObjectSchema`
- `extensions/model-memory/src/semantic-extraction-prompt.ts`
- `extensions/model-memory/src/semantic-validator.ts`
- `extensions/model-memory/src/proof/proof-runner.ts`

Rule for this sprint:

- do not replace those symbols
- do not rename or weaken them
- build MMV2 beside them

## New module boundary to create

Create a dedicated shadow implementation subtree:

- `extensions/model-memory/src/mmv2/`

Create these files and keep each file responsible for one phase or one shared
contract:

- `extensions/model-memory/src/mmv2/contracts.ts`
- `extensions/model-memory/src/mmv2/raw-ingest.ts`
- `extensions/model-memory/src/mmv2/segmentation.ts`
- `extensions/model-memory/src/mmv2/prompt-contracts.ts`
- `extensions/model-memory/src/mmv2/capture-routing.ts`
- `extensions/model-memory/src/mmv2/atomic-extraction.ts`
- `extensions/model-memory/src/mmv2/composite-extraction.ts`
- `extensions/model-memory/src/mmv2/canonicalization.ts`
- `extensions/model-memory/src/mmv2/admission.ts`
- `extensions/model-memory/src/mmv2/reconciliation.ts`
- `extensions/model-memory/src/mmv2/recording.ts`
- `extensions/model-memory/src/mmv2/post-write-audit.ts`
- `extensions/model-memory/src/mmv2/document-shadow-ingestion.ts`

Export only the top-level document shadow seam through
`extensions/model-memory/src/index.ts` during this sprint:

- `ingestDocumentV2Shadow(...)`

Do not export ordinary-turn MMV2 symbols yet.

## Exact symbols to implement

### Shared contracts

In `contracts.ts`, define the runtime-owned types and zod schemas that mirror
the MMV2 docs:

- `RawIngestEventSchema`
- `SegmentedIngestEventSchema`
- `CaptureRoutingBatchSchema`
- `AtomicExtractionBatchSchema`
- `CompositeExtractionBatchSchema`
- `CanonicalCandidateBatchSchema`
- `AdmissionDecisionBatchSchema`
- `ReconciliationInputSchema`
- `ReconciliationDecisionSchema`
- `MemoryEventSchema`
- `DurableMemoryRecordSchema`
- `MemoryEdgeSchema`
- `PostWriteAuditSchema`

Also define the exported TypeScript types inferred from those schemas.

### Deterministic phases

In `raw-ingest.ts`:

- `createRawIngestEvent(...)`

In `segmentation.ts`:

- `segmentRawIngestEvent(...)`
- `detectSegmentShape(...)`

### Model-owned prompt phases

In `capture-routing.ts`:

- `routeCaptureCandidates(...)`
- `repairCaptureRouting(...)`

In `atomic-extraction.ts`:

- `extractAtomicCandidates(...)`
- `repairAtomicExtraction(...)`

In `composite-extraction.ts`:

- `extractCompositeCandidates(...)`
- `repairCompositeExtraction(...)`
- `suppressAtomicCandidatesOwnedByComposites(...)`

In `canonicalization.ts`:

- `canonicalizeCandidates(...)`
- `repairCanonicalization(...)`

In `admission.ts`:

- `scoreAdmission(...)`
- `applyAdmissionThresholds(...)`

In `reconciliation.ts`:

- `reconcileCandidate(...)`
- `applyDeterministicReconciliationShortcuts(...)`

### Shadow persistence and orchestration

In `recording.ts`:

- `recordShadowMemoryBatch(...)`

This sprint should write only to an explicit shadow artifact surface, not the
live v1 store. Use one of these bounded outputs:

- in-memory result object returned from the runner
- JSON artifact written to a disposable proof path

Do not add DB migrations in this sprint.

In `post-write-audit.ts`:

- `runPostWriteAudit(...)`

In `document-shadow-ingestion.ts`:

- `ingestDocumentV2Shadow(...)`

This function is the orchestration seam for:

1. raw ingest
2. segmentation
3. routing
4. atomic extraction
5. composite extraction
6. canonicalization
7. admission
8. reconciliation
9. shadow recording
10. post-write audit

## Prompt ownership for this sprint

The first sprint must encode prompt builders directly from the MMV2 draft pack.

Use the prompt texts from:

- `docs/projects/model-memory/specs/mmv2/prompt-pack.md`
- `docs/projects/model-memory/specs/mmv2/classifier-instructions-baseline.md`

Implement prompt-builder functions in `extensions/model-memory/src/mmv2/prompt-contracts.ts`:

- `buildCaptureRoutingPrompt(...)`
- `buildAtomicExtractionPrompt(...)`
- `buildCompositeExtractionPrompt(...)`
- `buildCanonicalizationPrompt(...)`
- `buildAdmissionPrompt(...)`
- `buildReconciliationPrompt(...)`
- `buildRepairPrompt(...)`
- `buildEvidenceRepairPrompt(...)`

Do not reuse the live v1 prompt contract builders from
`semantic-extraction-prompt.ts` for MMV2.

## Model boundary and deterministic boundary

The sprint must preserve this authority split:

- model decides semantic routing, extraction, canonical wording, admission
  proposal, and reconciliation proposal
- deterministic code decides schema validation, exact evidence checks, repair
  retries, suppression, quarantine, and shadow persistence shape

Forbidden in this sprint:

- semantic keyword routing as final authority
- direct revival of detector-era parsing
- auto-conversion of every list into a procedure without model confirmation
- direct translation of MMV2 outputs back into the five-kind v1 object schema as
  the primary result

## Exact test files to add

Add these new targeted tests:

- `extensions/model-memory/src/mmv2/raw-ingest.test.ts`
- `extensions/model-memory/src/mmv2/segmentation.test.ts`
- `extensions/model-memory/src/mmv2/prompt-contracts.test.ts`
- `extensions/model-memory/src/mmv2/capture-routing.test.ts`
- `extensions/model-memory/src/mmv2/atomic-extraction.test.ts`
- `extensions/model-memory/src/mmv2/composite-extraction.test.ts`
- `extensions/model-memory/src/mmv2/canonicalization.test.ts`
- `extensions/model-memory/src/mmv2/admission.test.ts`
- `extensions/model-memory/src/mmv2/reconciliation.test.ts`
- `extensions/model-memory/src/mmv2/document-shadow-ingestion.test.ts`

## Exact behaviors the tests must prove

### `raw-ingest.test.ts`

- empty `raw_text` rejects
- Unicode normalization preserves source text for later span work
- event metadata fields survive intact

### `segmentation.test.ts`

- numbered lists stay grouped as list blocks
- heading plus bullets stay grouped
- overlapping spans can coexist
- exact character offsets remain stable

### `prompt-contracts.test.ts`

- each MMV2 prompt builder returns the expected contract name and version
- the classifier baseline text is present in the appropriate prompt layer
- repair prompts preserve the exact validation-error placeholders

### `capture-routing.test.ts`

- numbered or bullet list blocks route to composite by default
- smalltalk routes to ignore
- descriptive preference text does not become a rule at routing time
- invalid evidence quotes trigger repair or quarantine

### `atomic-extraction.test.ts`

- `I prefer ...` becomes `claim`, not hard directive
- `Never do X` becomes `directive`
- locator-heavy text becomes `source_ref`
- events with time/outcome become `episode`

### `composite-extraction.test.ts`

- procedures produce a parent composite artifact
- steps default to `embedded_only`
- guardrails can promote to `global`
- overlapping atomic candidates are suppressed when owned by the composite

### `canonicalization.test.ts`

- preference wording stays descriptive
- directives keep imperative modality
- canonical text remains single-sentence where required
- modality drift gets repaired or rejected

### `admission.test.ts`

- temporary instructions reject
- vague candidates quarantine or reject
- embedded-only components do not admit as standalone memory
- sensitivity thresholds block unsafe writes

### `reconciliation.test.ts`

- exact duplicates merge or ignore
- newer explicit preference changes supersede older inferred ones
- scope narrowing and broadening are distinguished
- conflict cases quarantine when not safely resolvable

### `document-shadow-ingestion.test.ts`

- a document can run through every MMV2 phase end to end
- routing, extraction, and audit results are returned as one structured result
- no live v1 database write occurs
- post-write audit catches standalone `embedded_only` leakage

## Existing tests to rerun in this sprint

These existing lanes must still pass after the new shadow lane lands:

- `extensions/model-memory/src/semantic-schema.test.ts`
- `extensions/model-memory/src/prompt-contracts.test.ts`
- `extensions/model-memory/src/document-ingestion.test.ts`
- `extensions/model-memory/src/ordinary-turn-capture.test.ts`

The point is to prove MMV2 is additive and shadow-only.

## Proof harness work required in this sprint

Add a bounded MMV2 proof harness that reuses the existing proof posture without
rewiring the live proof runner.

Create:

- `extensions/model-memory/src/mmv2/proof-corpus-shadow.test.ts`

Use a small audited document set that proves:

- descriptive preference versus directive split
- procedure capture as composite
- suppression of child leakage
- source-ref capture
- ignore behavior for chatter and temporary text

Do not extend ordinary-turn proof in this sprint.

## Exact validation commands for sprint completion

Run at minimum:

```bash
pnpm exec vitest run \
  extensions/model-memory/src/mmv2/raw-ingest.test.ts \
  extensions/model-memory/src/mmv2/segmentation.test.ts \
  extensions/model-memory/src/mmv2/prompt-contracts.test.ts \
  extensions/model-memory/src/mmv2/capture-routing.test.ts \
  extensions/model-memory/src/mmv2/atomic-extraction.test.ts \
  extensions/model-memory/src/mmv2/composite-extraction.test.ts \
  extensions/model-memory/src/mmv2/canonicalization.test.ts \
  extensions/model-memory/src/mmv2/admission.test.ts \
  extensions/model-memory/src/mmv2/reconciliation.test.ts \
  extensions/model-memory/src/mmv2/document-shadow-ingestion.test.ts \
  extensions/model-memory/src/mmv2/proof-corpus-shadow.test.ts
```

```bash
pnpm exec vitest run \
  extensions/model-memory/src/semantic-schema.test.ts \
  extensions/model-memory/src/prompt-contracts.test.ts \
  extensions/model-memory/src/document-ingestion.test.ts \
  extensions/model-memory/src/ordinary-turn-capture.test.ts
```

```bash
node scripts/check-doc-topology.mjs
```

## Explicit non-goals for this sprint

- no ordinary-turn MMV2 runtime
- no DB migration for MMV2 durable records
- no runtime read-model integration
- no retrieval-pack or projection integration
- no cutover away from the live five-kind v1 system
- no graph, capsule, or planner work

## Completion gate

Do not call the sprint complete unless all of these are true:

1. `ingestDocumentV2Shadow(...)` exists and runs end to end.
2. Every MMV2 phase has its own file and test coverage.
3. Composite-first capture is proven on ordered document examples.
4. Preference-versus-directive separation is proven on audited examples.
5. Shadow outputs preserve exact evidence spans or quarantine correctly.
6. Existing v1 document and turn tests still pass.
7. No live write path or ordinary-turn capture path is replaced.
