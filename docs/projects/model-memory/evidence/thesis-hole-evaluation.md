# Model Memory Thesis Hole Evaluation

- Generated at: 2026-04-15T16:01:20.015Z
- Baseline cutover judgment: not_ready_for_cutover
- Inputs:
  - AGENTS trace: docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json
  - Comparison traces: docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json, docs/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace.json
  - Duplicate audit: docs/projects/model-memory/evidence/duplicate-escape-audit.json
  - Duplicate benchmark: docs/projects/model-memory/evidence/duplicate-escape-benchmark.json
  - Duplicate review: docs/projects/model-memory/evidence/duplicate-escape-review.json
  - Proof phase report: docs/projects/model-memory/evidence/proof-phase-report.json
  - Support-only rebuild diff: docs/projects/model-memory/evidence/support-only-rebuild-diff.json

## Baseline Thesis

- Support-only churn is no longer the blocker; true pure_attach_support replay is stable.
- Retrieval/context boundedness is green on the current preserved corpus.
- The current cutover blocker is duplicate under-attachment in dense rule guidance, especially AGENTS.md.
- The failure appears mostly deterministic gate loss on wrapper-heavy same-rule restatements, with a smaller secondary batch-adjudication conservatism component.
- The preserved-corpus qualitative duplicate review is the strongest current cutover truth surface and outweighs the narrower benchmark seed basket.

## Hole Results

### hole_1_agents_trace_overstates_problem: AGENTS.md trace may be overstating the problem

- Concern: The AGENTS trace is a targeted scratch stress source and might not be representative of the preserved corpus.
- Assessment: partially_supported
- Effect on thesis: partially_weakens_thesis
- Confidence: medium
- Summary: AGENTS is clearly a worst-case stress source, but it is also a dominant preserved-corpus duplicate source, so it cannot be dismissed as a mere outlier.
- Evidence: AGENTS scratch trace zero_candidate_skips=27 versus comparison-trace mean=3.
- Evidence: AGENTS contributes 159 of 319 preserved-corpus rerun escapes.
- Evidence: Comparison traces still show substantially lower gate loss: docs/gateway/configuration.md zero_candidate_skips=3; docs/help/testing.md zero_candidate_skips=3.
- Metrics: {"agentsZeroCandidateSkips":27,"comparisonMeanZeroCandidateSkips":3,"agentsRerunEscapeShare":0.4984,"agentsRerunEscapeCount":159}

### hole_2_some_misses_may_be_correct_distincts: Some supposed misses may actually be correct distincts

- Concern: Wrapper-heavy or nearby candidates may still be adding real operational constraints, so some judged misses could actually be correct distinct writes.
- Assessment: partially_supported
- Effect on thesis: partially_weakens_thesis
- Confidence: medium
- Summary: The over-merge risk is real. The broad audit is dominated by legit-distinct and extra-constraint cases, so any duplicate thesis that ignores additive deltas would be too aggressive.
- Evidence: Preserved-corpus audit legit_distinct rate=0.6991.
- Evidence: Preserved-corpus audit extra_constraint packaging rate=0.9091.
- Evidence: The qualitative review still contains 2 clear should-attach cases, so the distinctness objection is real but not sufficient to erase the blocker.
- Metrics: {"auditLegitDistinctRate":0.6991,"auditExtraConstraintRate":0.9091,"reviewClearDuplicateShouldAttach":2,"reviewClearDistinctShouldStayDistinct":3}

### hole_3_qualitative_review_sample_is_small: Qualitative review sample is small

- Concern: The current review sample may be too small to justify a broad cutover blocker call.
- Assessment: supported
- Effect on thesis: partially_weakens_thesis
- Confidence: high
- Summary: This hole is real. The review is still the strongest truth surface, but its sample is small enough that it should be treated as high-signal rather than high-coverage evidence.
- Evidence: Review sample size is only 7.
- Evidence: Clear duplicate rate in review = 0.2857 with Wilson interval [0.0822, 0.6411].
- Evidence: That interval is wide enough that the underlying corpus-wide miss rate could be materially lower or higher than the observed 2/7.
- Metrics: {"reviewSampleSize":7,"reviewClearDuplicateRate":0.2857,"reviewWilsonLower":0.0822,"reviewWilsonUpper":0.6411}

### hole_4_benchmark_and_review_diverge: Benchmark and review are pulling in different directions

- Concern: The benchmark currently shows zero rerun attach-support misses while the qualitative review still surfaces clear misses.
- Assessment: supported
- Effect on thesis: partially_weakens_thesis
- Confidence: high
- Summary: The divergence is real. The benchmark seed basket is not broad enough to settle the cutover question by itself, so the thesis should explicitly treat benchmark cleanliness as narrower than review cleanliness.
- Evidence: Benchmark attachSupportMissRateOnReruns=0.
- Evidence: Review clear_duplicate_should_attach=2 of 7.
- Evidence: The current evidence set supports weighting the review above the benchmark for cutover, but not treating the benchmark as useless.
- Metrics: {"benchmarkRerunSampleSize":8,"benchmarkAttachSupportMissRateOnReruns":0,"reviewClearDuplicateShouldAttach":2,"reviewSampleSize":7}

### hole_5_support_only_result_may_be_narrower_than_it_looks: Support-only stability result may be narrower than it looks

- Concern: The proof now runs a true pure_attach_support lane, but it uses deterministic synthetic replay rather than a naturally occurring support-only source rerun.
- Assessment: supported
- Effect on thesis: partially_weakens_thesis
- Confidence: high
- Summary: The current stability result is honest and strong for a true attach-support replay, but it does not fully exhaust all natural reinforcement shapes.
- Evidence: Proof support probe class=pure_attach_support.
- Evidence: Proof support probe source type=synthetic_existing_object_replay.
- Evidence: Isolated rebuild diff classification=pure_support_only_stable.
- Metrics: {"supportOnlyProbeClass":"pure_attach_support","supportOnlyProbeSourceType":"synthetic_existing_object_replay","supportOnlyProjectionChurn":false,"supportOnlyArtifactChurn":false}

### hole_6_real_blocker_may_be_choice_not_recall: The real blocker may be choice, not recall

- Concern: The surviving candidates may already be sufficient, and the bigger remaining issue may be batch adjudication being too conservative on wrapper-drift rule cases.
- Assessment: partially_supported
- Effect on thesis: reframes_thesis
- Confidence: high
- Summary: The evidence now points to a mixed blocker: recall is still dominant in AGENTS scratch traces, but the reviewed clear misses all reached batched adjudication, so choice quality is also materially involved.
- Evidence: AGENTS zero_candidate_skips=27 versus admitted_to_batch=4.
- Evidence: All 7 reviewed cases replayed through batched_adjudication.
- Evidence: 2 reviewed cases are clear should-attach despite reaching the batch lane.
- Metrics: {"agentsZeroCandidateSkips":27,"agentsAdmittedToBatch":4,"reviewCasesThroughBatch":7,"reviewClearDuplicateShouldAttach":2}

### hole_7_replayed_audit_path_may_diverge_from_live_path: Replay-based audit path may still diverge from the live write path

- Concern: The audit replays cases using current runtime helpers, so it may still drift from exact live ordering or neighborhood behavior.
- Assessment: insufficient_evidence
- Effect on thesis: unknown
- Confidence: low
- Summary: Current artifacts do not provide a direct live-versus-replay paired comparison, so this hole remains unresolved rather than disproved.
- Evidence: The duplicate audit is replay-based by design and no artifact currently pairs each replayed case with a contemporaneous live collision trace for the same object.
- Evidence: The audit now reuses source-family context, which reduces a known source of divergence, but does not eliminate all possible replay drift.
- Metrics: {"directLiveVsReplayPairingArtifactExists":false,"reviewSampleSize":7}

### hole_8_cutover_bar_may_be_stricter_than_operationally_necessary: Cutover bar itself may be stricter than operationally necessary

- Concern: The current cutover bar may be intentionally conservative beyond what production rollout actually requires.
- Assessment: insufficient_evidence
- Effect on thesis: unknown
- Confidence: low
- Summary: This is a governance question more than an empirical one. Current evidence can show which bars pass and fail, but it cannot decide the right operational risk tolerance by itself.
- Evidence: Current cutover bar passes support-only stability, stable-surface stability, and current-corpus retrieval/context boundedness, but fails AGENTS duplicate quality and preserved-corpus duplicate review.
- Evidence: A team could choose a more permissive operational bar, but that would be a conscious policy change rather than a factual correction.
- Metrics: {"cutoverBarPassedChecks":3,"cutoverBarFailedChecks":2,"reviewClearDuplicateShouldAttach":2}

### hole_9_reference_deferred_could_be_hidden_gap: Deferred reference recall could be a hidden gap

- Concern: Reference memories may be under-sampled and could still be a meaningful duplicate blocker despite being deferred.
- Assessment: not_supported
- Effect on thesis: does_not_weaken_thesis
- Confidence: medium
- Summary: Current preserved-corpus evidence does not support reference as the next blocker. It remains under-sampled, but not materially represented.
- Evidence: Reference rerun-escape count=2 of 319.
- Evidence: Current qualitative review includes 0 reference cases.
- Metrics: {"referenceRerunEscapeCount":2,"totalRerunEscapeCount":319,"referenceReviewCases":0}

### hole_10_current_corpus_green_lanes_may_not_generalize: Current-corpus green lanes may not generalize

- Concern: The retrieval/context proof is green on the current corpus, but current probes may not cover broader production prompt shapes.
- Assessment: supported
- Effect on thesis: partially_weakens_thesis
- Confidence: medium
- Summary: Current-corpus green still matters, but generalization is not fully proven. The current proof basket is bounded and should be treated as a current-corpus result, not universal coverage.
- Evidence: Current proof basket covers 4 retrieval/context probes.
- Evidence: Current probes report errors=0, pruned=0, max_estimated_tokens=1339.
- Evidence: Green status on this basket is strong current-corpus evidence but still limited breadth evidence.
- Metrics: {"retrievalProbeCount":4,"retrievalProbeErrors":0,"retrievalProbePruned":0,"maxRetrievalTokens":1339}

## Reevaluated Thesis

- Cutover judgment: not_ready_for_cutover
- Confidence: medium
- Concise judgment: The baseline thesis was directionally right but too recall-centric. The updated thesis is that cutover is still blocked by duplicate quality in dense rule guidance, with AGENTS proving a mixed recall-plus-batch-choice problem rather than a recall-only one.
- Thesis still looks true:
  - Support-only churn is no longer a live blocker; both isolated diff and honest pure_attach_support replay show stable support-only behavior.
  - Retrieval/context boundedness is green on the current preserved corpus.
  - AGENTS is not just a synthetic outlier; it is also the single largest preserved-corpus rerun-escape source.
  - Duplicate quality remains the live cutover blocker.
- Thesis needs revision:
  - The blocker should no longer be described as mostly deterministic recall loss alone.
  - Current evidence supports a mixed blocker: deterministic gate loss remains large in AGENTS traces, but batch adjudication is still missing some same-claim rule cases that already reached the batch lane.
  - The qualitative review should still outrank the benchmark for cutover judgment, but only as a high-signal bounded sample, not as broad corpus coverage.
- Remaining blockers:
  - AGENTS still shows dominant deterministic gate loss on the current scratch hinge trace.
  - Preserved-corpus qualitative review still contains clear duplicate cases that should have attached support.
  - The benchmark and qualitative review still diverge enough that duplicate quality is not yet settled cleanly.
- Next tests that would change the call:
  - Expand qualitative duplicate review to a materially larger preserved-corpus sample, especially AGENTS rule cases.
  - Add a paired live-vs-replay audit trace for reviewed duplicate cases to test replay drift directly.
  - Run one more narrow AGENTS-specific batch-evidence improvement pass and refresh the preserved-corpus review.
  - Add a broader retrieval/context probe basket before treating current-corpus green as production-generalized.
