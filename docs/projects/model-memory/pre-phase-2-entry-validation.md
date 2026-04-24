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

Current execution artifact root:

```text
.artifacts/model-memory/phase2-entry-validation/2026-04-24/
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
.artifacts/model-memory/phase2-entry-validation/2026-04-24/final-report/phase2-entry-report.json
```

Decision: `red`

Phase 2 authorization: `false`

Current blockers:

- `pg_stat_statements_unavailable`
  - evidence: `not_installed`
- `recovery_gate_not_safe`
  - evidence:
    `overall_reconcile_class=rebuild_required; blocking_surfaces=runtime_dirty`
- `load_ordinary_turn_failed`
  - evidence: controlled scratch ordinary-turn seed failed on invalid strict
    structured output from `openai-codex/gpt-5.4-mini`
- `load_retrieval_failed`
  - evidence: retrieval iterations failed with
    `model-memory runtime rebuild lock is busy`

Supporting green surfaces:

- retrieval eval matrix passed `11/11`
- no-dark-data adversarial pack passed `4/4`
- bounded live validation finished `yellow`, not `red`
  - memmech live proof passed
  - capture-seams live proof passed
  - projection live behavior proof passed
  - post-run recovery posture still remained blocked

## Current Next Lane

Before rerunning the entry pack:

1. clear `runtime_dirty` rebuild state so recovery is Phase-2-entry-safe
2. install or enable `pg_stat_statements`
3. investigate and fix the strict structured-output failure on the controlled
   ordinary-turn seed
4. investigate and fix retrieval failure under rebuild-lock pressure in the
   controlled load path
5. rerun this entry-validation pack and replace the artifact root with the new
   decision

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
