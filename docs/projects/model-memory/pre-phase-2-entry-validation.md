---
summary: "Operator runbook for the final pre-Phase-2 entry validation pack."
title: "Pre-Phase-2 Entry Validation"
---

# Pre-Phase-2 Entry Validation

This runbook is the operator surface for the final pre-Phase-2 entry
validation pack.

Use it to answer one question with evidence:

Can Phase 2 start now, or is it still blocked?

## Artifact Root

Latest authoritative artifact root:

```text
.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-03/
```

Subdirectories:

- `baseline/`
- `load-test/`
- `retrieval-evals/`
- `no-dark-data/`
- `live-validation/`
- `final-report/`

## Operator Command

Run the full pack:

```bash
node --import tsx scripts/model-memory-phase2-entry-validation.ts
```

Optional explicit artifact root:

```bash
node --import tsx scripts/model-memory-phase2-entry-validation.ts \
  --artifact-root .artifacts/model-memory/phase2-entry-validation/$(date -u +%Y-%m-%d)
```

The script is proof-only. It writes reports under the artifact root and does
not intentionally write benchmark/eval garbage into the live durable semantic
DB.

## What The Pack Proves

1. Baseline DB gate posture through:
   - `scripts/model-memory-phase2-db-gates.ts`
2. Baseline recovery posture through:
   - `scripts/model-memory-phase2-recovery-gates.ts`
3. Controlled isolated load behavior for:
   - ordinary-turn capture seed
   - tool-result capture
   - rebuild
   - retrieval pack assembly
   - concurrent gateway health
4. Retrieval quality independently from same-day capture quality
5. No-dark-data behavior for the key memory/report surfaces
6. Bounded live runtime validation against the current memory stack
7. Final `green` / `yellow` / `red` entry decision

## Current 2026-04-24 Result

Final report:

```text
.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-03/final-report/phase2-entry-report.json
```

Decision: `green`

Phase 2 authorization: `true`

Latest proof summary:

- baseline DB gates: `green`
- baseline recovery gates: `green`
- controlled load test: `green`
- retrieval eval matrix: passed `11/11`
- no-dark-data adversarial pack: passed `4/4`
- bounded live validation: `green`
- final operator decision: `green`

Blockers cleared in the rerun lane:

- reconciled orphaned live `runtime_dirty` rebuild state and proved recovery
  gates `clean`
- enabled live `pg_stat_statements`
- fixed MMV2 session-turn proof routing so the strict-mini ordinary-turn seed
  uses the MMV2 interpreter path
- hardened MMV2 atomic extraction so irreparable repair output safely skips
  the bad model-routed atomic batch instead of crashing the ordinary-turn path
- fixed rebuild-lane self-deadlock during runtime rebuild
- fixed the controlled-load retrieval harness
- widened the projection live-behavior proof timeout so the full pack can
  finish honestly

Historical audit roots:

- initial red pack:
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24/`
- intermediate reruns:
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-01/`
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-02/`

## Current Next Lane

Phase 2 implementation may begin. The pre-Phase-2 blocker pack is complete.

## Entry Decision Rule

Treat the final entry pack as:

- `green`
  - Phase 2 can start now
- `yellow`
  - warnings exist but no blocker remains; warnings must be recorded
- `red`
  - Phase 2 stays blocked; each blocker must have exact evidence and an
    explicit next lane

Do not authorize Phase 2 from partial proof, optimistic prose, or green
subsections alone. The final decision comes from the full pack.
