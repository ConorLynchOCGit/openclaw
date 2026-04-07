# Production Recurring Procedure Parity V1 Report

## Scope

This report covers the first recurring-procedure parity tranche:

- bounded generic named recurring checklist capture
- first-evidence `hold_for_more_evidence`
- later confirmation promotion on the existing candidate -> draft ->
  validated procedure substrate
- explicit correction / supersede for the same recurring-procedure subject
- project-scoped approved-only hybrid retrieval for direct named generic
  checklist asks

Out of scope:

- vague one-off procedure memory
- broader workflow extraction
- silent background application
- self-improving capture
- learned-guidance advisory planning

## Proof inputs

### Isolated hold

Transcript:

```text
My atlas parity evidence relay checklist:
1. Capture the signed evidence bundle.
2. Confirm archive replication.
```

### Isolated confirmation and retrieval

Tool-submitted second evidence:

```text
Our atlas parity evidence relay checklist:
1. Capture the signed evidence bundle.
2. Confirm archive replication.
```

Hybrid retrieval query:

```text
atlas parity evidence relay checklist
```

### Isolated correction

Tool-submitted correction:

```text
Actually, my atlas parity evidence relay checklist:
1. Capture the signed evidence bundle.
2. Confirm archive replication.
3. Post the audit handoff note.
```

### Isolated ambiguity / no-write

Transcript:

```text
For this release today:
1. Capture the signed evidence bundle.
2. Post the audit handoff note.
```

### Production hold

Transcript:

```text
My cedar parity evidence relay checklist:
1. Capture the signed evidence bundle.
2. Confirm archive replication.
```

### Production confirmation and retrieval

Tool-submitted second evidence:

```text
Our cedar parity evidence relay checklist:
1. Capture the signed evidence bundle.
2. Confirm archive replication.
```

Hybrid retrieval query:

```text
cedar parity evidence relay checklist
```

## Evidence

### Isolated hold

- candidate id: `096b4bee-bb95-4546-8517-a867786f4feb`
- event id: `7cc250d9-a0ba-4405-8149-d03c44216027`
- cluster key: `e73e38ec91e30591b916d73a253be8c12aa3fcef499c4056dfb89ca815cef766`
- subject key: `b45d181ce77c700ded4a6eac9f1e82a46fe77d109e9eb167d9e370ab2933fa32`
- title: `Atlas Parity Evidence Relay Checklist`
- procedure family: `generalized_named_checklist`
- lifecycle state: `hold_for_more_evidence`
- project id persisted on candidate: `7521afa7-d7c3-4d06-821d-c6c7b6e81289`

### Isolated confirmation and retrieval

- held candidate promoted from: `096b4bee-bb95-4546-8517-a867786f4feb`
- accepted review id: `76b42798-2900-49c3-a161-868ccdd1b59e`
- validated procedure id: `ab9a7e0a-9a78-4401-9ff3-3112160eefec`
- validation run id: `c40e8552-57ee-46d3-92eb-ced3e8587e79`
- promotion profile: `recurring_procedure_generalized_confirmation_v1`
- confirmation method: `repeat_subject_signal`
- project id on validated procedure: `7521afa7-d7c3-4d06-821d-c6c7b6e81289`
- hybrid retrieval top record id: `ab9a7e0a-9a78-4401-9ff3-3112160eefec`
- hybrid retrieval matched fields:
  - `title_exact`
  - `title_prefix`
  - `procedure_subject_match`
  - `procedure_subject_prefix`
  - `fts_search_document`
  - `trigram_similarity`

### Isolated correction / supersede

- correction candidate id: `aeb28c6a-ff08-4ddb-b518-1cf728034174`
- correction event id: `f9500f3c-b841-45d0-9b04-4141d00aab43`
- correction review id: `6b82a9d7-de9a-45e6-9abd-68a2c0ef6f36`
- corrected validated procedure id: `3f751852-36f2-4d7c-8e8b-2530fffee015`
- validation run id: `47061a8e-d129-4493-aa24-584a0e303b75`
- promotion profile: `recurring_procedure_generalized_correction_v1`
- superseded prior validated procedure:
  - prior procedure id: `ab9a7e0a-9a78-4401-9ff3-3112160eefec`
  - final status: `superseded`
  - supersededByProcedureId:
    `3f751852-36f2-4d7c-8e8b-2530fffee015`

### Isolated ambiguity / no-write

- result: `ignored = true`
- no candidate id
- no lifecycle evidence
- no durable write

### Production hold

- candidate id: `fc27f9a4-a0c8-4629-9644-5974c2645faa`
- event id: `b2f0facc-0a3e-4db9-a772-fc37ac61655e`
- cluster key: `5563878037c855fe7ed706f2e6fad439240738a19a88311c5814f51c0c3f1869`
- subject key: `722da8fa6deacaac138f9f3e4ef480348f49750cebfb3e884e4ba59ec88f66b2`
- title: `Cedar Parity Evidence Relay Checklist`
- procedure family: `generalized_named_checklist`
- lifecycle state: `hold_for_more_evidence`
- project id persisted on candidate: `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`

### Production confirmation and retrieval

- held candidate promoted from: `fc27f9a4-a0c8-4629-9644-5974c2645faa`
- accepted review id: `ffb6b84e-79f0-4ece-8ac1-a549f5d19723`
- validated procedure id: `9ef2503f-68c8-46f6-aeef-84e11f4313d0`
- validation run id: `7a7c402e-c7e2-4394-b4d6-561deac74f23`
- promotion profile: `recurring_procedure_generalized_confirmation_v1`
- confirmation method: `repeat_subject_signal`
- project id on validated procedure: `437d43ff-1c9d-4757-8d44-cd8e0aeb241b`
- hybrid retrieval top record id: `9ef2503f-68c8-46f6-aeef-84e11f4313d0`
- hybrid retrieval matched fields:
  - `title_exact`
  - `title_prefix`
  - `procedure_subject_match`
  - `procedure_subject_prefix`
  - `fts_search_document`
  - `trigram_similarity`

## Health

Isolated proof environment:

- `http://127.0.0.1:37789/healthz` -> `fetch failed`
- `http://127.0.0.1:37789/readyz` -> `fetch failed`

Production proof environment:

- before hold:
  - `http://127.0.0.1:28789/healthz` -> `200 {"ok":true,"status":"live"}`
  - `http://127.0.0.1:28789/readyz` -> `200 {"ready":true}`
- after hold:
  - `http://127.0.0.1:28789/healthz` -> `200 {"ok":true,"status":"live"}`
  - `http://127.0.0.1:28789/readyz` -> `200 {"ready":true}`

## Notes / limitations

- The ordinary-turn transcript hold proof exercised the new transcript-driven
  generic recurring checklist capture path directly.
- In this environment, transcript-driven confirmation promotion can stall
  after the validated procedure write while waiting on later embedding-side
  work, so the later confirmation, retrieval, and correction proof steps were
  completed by invoking the same memory-middleware runtime through the
  candidate-submit tool path on the same held cluster.
- This still exercised the real recurring-procedure semantic normalization,
  held-cluster confirmation, procedure promotion, validation, supersede, and
  hybrid retrieval substrate for the parity tranche without broadening scope.
