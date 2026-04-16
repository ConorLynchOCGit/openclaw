# Model Memory Proof Phase

- Generated at: 2026-04-15T20:45:18.699Z
- Corpus mode: current_corpus
- Source plan: default proof sources
- Model: openrouter/openai/gpt-5.4-nano
- Candidate model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Workspace root: /root/.openclaw/workspace
- Sources ingested: 15
- Corpus totals: objects=686 supports=688 active=580 provisional=5 conflict_hold=88

## Ingestion tranche

## Saturation

- Run 1: objectDelta=20 supportItemDelta=20 attach_support=6 distinct_write=19 near_duplicate_escape=20
- Run 2: objectDelta=13 supportItemDelta=13 attach_support=8 distinct_write=13 near_duplicate_escape=13
- Run 3: objectDelta=17 supportItemDelta=17 attach_support=16 distinct_write=15 near_duplicate_escape=17

## Retrieval and context

- probe-live-tests-primary-1776285278574: selected=5 matchingKinds=3 matchingClasses=0 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297
- probe-gateway-protocol-primary-1776285278574: selected=5 matchingKinds=5 matchingClasses=5 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297
- probe-planning-guidance-primary-1776285278574: selected=5 matchingKinds=5 matchingClasses=3 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297
- probe-schema-reference-primary-1776285278574: selected=5 matchingKinds=5 matchingClasses=4 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297
- probe-mixed-work-prompt-primary-1776285278574: selected=5 matchingKinds=5 matchingClasses=5 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297
- probe-rule-heavy-instruction-primary-1776285278574: selected=5 matchingKinds=4 matchingClasses=5 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297
- probe-fact-heavy-configuration-primary-1776285278574: selected=5 matchingKinds=5 matchingClasses=5 activeOnly=true retrievalPackIncluded=false pruningUsed=true estimatedTokens=1297

## Runtime read models

- Active memory slots: 123
- Active memory sets: 580
- Context artifacts: 87
- Projection versions: 27
- Active-only default reads hold: true
- Slot leaks: 0 | Set leaks: 0

## Rebuild and cache

- Projection hashes stable on unchanged rebuild: true
- Stable artifact hashes stable on unchanged rebuild: true
- Unchanged rebuild class: transient_retrieval_artifact_growth
- Transient retrieval-pack artifact growth keys on unchanged rebuild: 7
- Support-only source: synthetic/support-only-proof/26e8acab-21e3-54ac-bb1d-e6da5a152cdc.md
- Support-only target: 26e8acab-21e3-54ac-bb1d-e6da5a152cdc | Use repo-root relative file references only; never use absolute paths or ~/...
- Support-only target source type: synthetic_existing_object_replay
- Support probe class: pure_attach_support
- Support-only projection churn: false
- Support-only stable artifact churn: false
- Support-only transient retrieval-pack growth keys: 2
- Support-only stable-surface diffs: 0
- Stable layer stable on unchanged rerun: true
- Semi-stable layer stable on unchanged rerun: true
- Volatile layer stable on unchanged rerun: true
- Stable layer stable after support-only write: true
- Semi-stable layer stable after support-only write: true
- Volatile layer stable after support-only write: true
- Stable cache-segment diffs after support probe: 0

## Operator and shadow

- Operator surfaces operational: true
- Recent captures=20 writeDecisions=20 projectionVersions=20
- Retrieval requests=20 resultSets=20 resultItems=20
- Context runs=20 segments=20
- Shadow surface operational: true (comparisonMeaningful=false)
- Shadow source: docs/help/testing.md | matched=0 modelOnly=11 legacyOnly=0

## Long horizon

- Active objects: 534 -> 580
- Support items: 638 -> 688
- Duplicate active-object candidates: 29
- Support outgrew objects on reruns: true

## Proof gaps

- storage_lifecycle: proven
  - seams: extensions/model-memory/src/write-policy.ts, extensions/model-memory/src/memory-object-store.ts, extensions/model-memory/src/runtime-read-models.ts
  - notes: active_objects=580; provisional_objects=5; conflict_hold_objects=88
- retrieval: proven
  - seams: extensions/model-memory/src/retrieval.ts, extensions/model-memory/src/retrieval-store.ts, extensions/model-memory/src/real-retrieval-request-interpreter.ts
  - notes: probe-live-tests-primary-1776285278574:selected=5:matchingKinds=3:matchingClasses=0:activeOnly=true; probe-gateway-protocol-primary-1776285278574:selected=5:matchingKinds=5:matchingClasses=5:activeOnly=true; probe-planning-guidance-primary-1776285278574:selected=5:matchingKinds=5:matchingClasses=3:activeOnly=true; probe-schema-reference-primary-1776285278574:selected=5:matchingKinds=5:matchingClasses=4:activeOnly=true; probe-mixed-work-prompt-primary-1776285278574:selected=5:matchingKinds=5:matchingClasses=5:activeOnly=true; probe-rule-heavy-instruction-primary-1776285278574:selected=5:matchingKinds=4:matchingClasses=5:activeOnly=true; probe-fact-heavy-configuration-primary-1776285278574:selected=5:matchingKinds=5:matchingClasses=5:activeOnly=true
- context_assembly: proven
  - seams: extensions/model-memory/src/runtime/context/assemble.ts, extensions/model-memory/src/context-engine.ts
  - notes: probe-live-tests-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true; probe-gateway-protocol-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true; probe-planning-guidance-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true; probe-schema-reference-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true; probe-mixed-work-prompt-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true; probe-rule-heavy-instruction-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true; probe-fact-heavy-configuration-primary-1776285278574:segments=6:estimatedTokens=1297:pruning=true
- runtime_read_models: proven
  - seams: extensions/model-memory/src/runtime-read-models.ts, extensions/model-memory/src/runtime/active-memory-slots.ts, extensions/model-memory/src/runtime/active-memory-sets.ts
  - notes: slots=123; sets=580; slot_leaks=0; set_leaks=0
- projections_rebuild: proven
  - seams: extensions/model-memory/src/runtime-rebuild-orchestrator.ts, extensions/model-memory/src/projection-compiler.ts
  - notes: projection_hashes_stable=true; artifact_hashes_stable=true; unchanged_rebuild_class=transient_retrieval_artifact_growth; transient_artifact_growth=7; support_probe_class=pure_attach_support; support_only_projection_churn=false; support_only_artifact_churn=false
- cache_usage: proven
  - seams: extensions/model-memory/src/usage-cache-ledger.ts, extensions/model-memory/src/context-engine.ts
  - notes: unchanged_stable=true; unchanged_semi=true; unchanged_volatile=true; support_only_stable=true; support_only_semi=true; support_only_volatile=true; support_probe_class=pure_attach_support
- operator_inspection: proven
  - seams: extensions/model-memory/src/operator-inspection.ts
  - notes: recent_captures=20; write_decisions=20; projection_versions=20; retrieval_requests=20; context_runs=20
- shadow_runtime_integration: already_partially_covered
  - seams: extensions/model-memory/src/shadow-mode.ts, extensions/model-memory/src/live-shadow-adapters.ts
  - notes: surface_operational=true; comparison_meaningful=false; shadow_surface_executed_with_stub_legacy_observer; legacy_parity_not_proven_in_this_phase
- long_horizon_behavior: failing_or_unstable
  - seams: src/agents/model-memory.proof-phase.ts, extensions/model-memory/src/write-policy.ts, extensions/model-memory/src/semantic-collision-adjudication.ts
  - notes: starting_active=534; ending_active=580; starting_supports=638; ending_supports=688; duplicate_active_object_count=29; support_outgrew_objects=true

## Readiness

- Decision: not_ready
- Ready: false
- Blockers: long_horizon_behavior
- Reasons: blocked_by:long_horizon_behavior
