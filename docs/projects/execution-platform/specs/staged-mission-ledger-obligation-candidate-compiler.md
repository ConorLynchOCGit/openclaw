---
summary: "Staged Mission Ledger obligation candidate compiler and packet-stability contract."
title: "Staged Mission Ledger Obligation Candidate Compiler"
---

# Staged Mission Ledger Obligation Candidate Compiler

## Status

Implemented as diagnostic/proof infrastructure only. It is hard-disabled from
production coding-team Mission Ledger creation after the 2026-05-22 rollback.
Production now uses the prior working single-pass Mission Ledger path by
default.

This spec remains the record of the staged compiler experiment and its
diagnostic artifacts. It must not be treated as the current production
Mission Ledger architecture unless `OPENCLAW_ENABLE_STAGED_MISSION_LEDGER_DIAGNOSTIC=true`
and the explicit per-job diagnostic payload flag are both set.

## Implementation Evidence

Implemented code:

- `extensions/execution-platform/src/workflows/staged-mission-ledger-obligation-compiler.ts`
  owns the staged compiler schemas and runtime-only compilation functions for
  source-prompt structural anchors, obligation candidate sets, canonical
  commitment ids, Mission Contract Ledger projection, packet semantic briefs,
  fast-model no-content diagnostics, and failed-packet replay results.
- `DynamicAgentTeamGraphRunner` can run Mission Ledger creation as a staged
  diagnostic protocol only:
  `objective_constraints -> obligation_candidate_extraction ->
runtime_candidate_compilation -> candidate_review ->
runtime_canonical_commitment_compilation -> mission_ledger_acceptance`.
  The prior working one-shot model call is the live production
  `agent_team.coding` Mission Ledger path.
- The candidate extraction stage may use `localCandidateRef` because it is a
  model-local scratch reference. The review stage receives only runtime
  `candidateRef` values from the compiled candidate set. `candidateLocalRefs`
  and model-local refs in review are contract failures, not aliases.
- `CodexDynamicJsonClient` no longer forces every JSON call through GPT-5.5
  `xhigh`; both production single-pass Mission Ledger creation and staged
  diagnostic calls use call-site reasoning budgets.
- If any stage fails shape/ref validation, the runner writes a bounded
  `execution_platform.staged_mission_ledger.stage_repair_diagnostic` artifact,
  emits owner-visible scheduler progress, and terminalizes the boundary as
  `needs_review` without falling back to legacy `blockingCommitments`.
- Staged Mission Ledger candidate/review/canonical commitment artifacts are
  written through payload-backed runtime artifact contracts, not inline
  metadata bodies.
- Commitment packet and context-synthesis fast-model diagnostics now include
  max output tokens, timeout, response mode, reasoning mode, input bundle
  ref/hash, concurrency slot, parsed content length, content lengths, exact
  no-content reason class, and retry eligibility.
- Mission Ledger Stability Diagnostics v2 records no-content reason
  histograms and marks failed-packet replay as required when repeated
  bounded-input failures occur.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/staged-mission-ledger-obligation-compiler.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
  passed 35 tests.
- `pnpm tsgo:fast -- extensions/execution-platform/src/workflows/staged-mission-ledger-obligation-compiler.ts extensions/execution-platform/src/workflows/staged-mission-ledger-obligation-compiler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts`
  passed through the repo fallback checker.

## Triggering Evidence

The live Mission Ledger Stability Diagnostics preflight ran the same
Product/Spec prompt twice through Mission Ledger and Commitment Work Packet
authoring:

- Run A: 10 blocking commitments and 10 packets.
- Run B: 13 blocking commitments and 13 packets.
- Provider variance: 3 Qwen no-content retries and 6 GPT-5.5 rescue uses.
- Verdict: `needs_review_structural_drift`.
- `safeToRunProductSpecProof: false`.

The diagnostic proved the measurement lane works, but it also proved the
current Mission Ledger/packet boundary is not stable enough for the next
Product/Spec proof. A later implementation failure would be contaminated by
the fact that upstream commitment identity and packet count are not durable.

## Rollback Evidence

The first repeated Product/Spec packet-boundary proof against the staged
production path failed before packet authoring:

- staged call: `mission_ledger_objective_constraints_model_call`;
- model: `openai-codex/gpt-5.5`;
- output bytes: about 11 KB;
- failure: `objectiveConstraints.explicitConstraints` exceeded the staged
  schema's 30-item bound;
- terminal state: `needs_review` via
  `worker_adapter_threw:mission_ledger_stage_contract`.

This showed that the staged direction moved schema pressure earlier in the
pipeline and added latency before any evidence that it improved Product/Spec
outcomes. Production behavior was therefore restored to
`mission_ledger.production_single_pass`, with staged support retained only as
diagnostic/proof infrastructure.

## Governing Principle

Model owns semantic judgment:

- what the owner asked for;
- which obligations exist;
- whether an obligation is blocking or nonblocking;
- whether candidate obligations should be merged, split, discarded, or added;
- what evidence would satisfy a commitment;
- whether a packet is semantically useful.

Runtime owns execution substrate:

- source prompt indexing;
- structural prompt anchors;
- stable ids;
- refs;
- schemas;
- bounds;
- storage;
- lifecycle;
- replayability;
- provider diagnostics;
- proof gates.

Runtime must not infer commitments from keywords, regexes, semantic labels, or
prose similarity. Runtime may mechanically assign stable ids from source
anchors and hashes only after the model has supplied semantic candidates.

## Non-Goals

- Do not make deterministic code decide that two obligations are semantically
  equivalent.
- Do not keyword-classify commitments into Product/Spec, coding, planning, or
  any other domain category.
- Do not rely on prose fingerprint drift as a proof blocker by itself.
- Do not silently rescue packet authoring with GPT-5.5 and call the boundary
  stable.
- Do not raise metadata limits, inline raw prompts, or store raw provider
  responses to make this easier.
- Do not let models author runtime ids, executor keys, graph node kinds,
  payload refs, storage flags, or lifecycle transitions.

## Architecture

The Mission Ledger must become a staged tool protocol:

1. `extract_objective_and_constraints`
2. `extract_obligation_candidates`
3. `compile_candidate_set`
4. `review_candidate_set`
5. `compile_canonical_commitments`
6. `accept_mission_ledger`

Packet authoring must consume only accepted canonical commitments:

1. `author_packet_semantic_brief`
2. `review_packet_brief_substance`
3. `complete_packet_brief_fields`
4. `compile_commitment_work_packet`
5. `accept_packet_set`

The runtime compiles durable artifacts between model steps. The model never
hand-authors the final runtime envelope.

Only explicit diagnostic runs follow this protocol. The production
coding-team runner follows the restored single-pass Mission Ledger protocol.
The model stages author semantics only; runtime stages construct refs, ids,
artifact envelopes, Mission Contract Ledger projection, and acceptance status.

## Source Prompt Structural Anchors

Before Mission Ledger extraction, runtime creates a bounded source prompt
index.

`SourcePromptStructuralAnchor`:

- `promptHash`: hash of the full owner prompt.
- `promptVersionRef`: durable ref to the bounded source prompt index.
- `sectionRef`: runtime-derived section/block ref.
- `blockOrdinal`: structural block ordinal within the source prompt index.
- `charStart` and `charEnd`: bounded character span when available.
- `excerptRef`: bounded excerpt ref; not raw prompt body in metadata.
- `excerptHash`: hash of the bounded excerpt payload.

Runtime may create these anchors because they are structural. It must not name
what an anchor means. The model attaches meaning to anchors in the candidate
step.

## Tool 1: extract_objective_and_constraints

Task class: `global_reasoning`.

Model input:

- full source prompt ref;
- bounded source prompt index;
- workflow definition summary;
- owner-visible instructions for separating objective, constraints, non-goals,
  and proof gates.

Model output:

- owner objective;
- high-level mission goal;
- explicit constraints with source anchors;
- explicit non-goals with source anchors;
- proof/success language with source anchors;
- ambiguity notes.

Runtime validation:

- every constraint/non-goal/proof note has at least one source anchor;
- output is bounded;
- no runtime ids are accepted from the model.

## Tool 2: extract_obligation_candidates

Task class: `global_reasoning` for the full prompt, or
`local_semantic_extraction` if the source prompt index is partitioned and
parallelized by structural section.

Model input:

- objective/constraints artifact ref;
- source prompt index and bounded excerpt refs;
- workflow evidence profile summary;
- instruction to extract owner obligations, not runtime graph nodes.

Model output: `ObligationCandidate[]`.

`ObligationCandidate` fields:

- `localCandidateRef`: model-local temporary ref only.
- `sourceAnchors`: one or more `SourcePromptStructuralAnchor` refs.
- `obligationText`: model-authored obligation in owner language.
- `whyItIsAnObligation`: model-authored rationale.
- `blockingProposal`: `blocking`, `nonblocking`, or `needs_owner_review`.
- `evidenceExpectation`: model-authored evidence expectation in human terms.
- `constraintRefs`: source constraint refs that shape this obligation.
- `nonGoalRefs`: source non-goal refs if relevant.
- `ambiguityNotes`: bounded model-authored uncertainty.

Runtime validation:

- candidate text and rationale are present;
- candidate has source anchors;
- blocking proposal is one allowed enum value;
- evidence expectation is human-readable, not a runtime evidence enum;
- model-authored runtime ids are ignored or rejected.

## Tool 3: compile_candidate_set

Task class: runtime-only `resource_materialization`.

Runtime input:

- objective/constraints artifact;
- obligation candidates;
- source prompt structural anchors.

Runtime output: `CompiledObligationCandidateSet`.

Runtime behavior:

- assign `candidateStableRef` mechanically from:
  - `promptHash`;
  - sorted source anchor refs;
  - model-local candidate ordinal;
  - bounded normalized candidate text hash.
- preserve all candidates, including possible duplicates.
- record duplicate-anchor groups as structural overlap only.
- record missing-anchor candidates as invalid shape, not semantic failure.
- write payload-backed artifact bodies and bounded manifests.

Runtime must not:

- merge candidates;
- split candidates;
- discard candidates;
- infer blocking status;
- classify domain categories;
- decide semantic equivalence.

## Tool 4: review_candidate_set

Task class: `global_reasoning`.

Model input:

- compiled candidate set ref;
- objective/constraints ref;
- bounded source prompt index refs;
- diagnostic summary of candidate anchor coverage and duplicate-anchor groups.

Model output: `ObligationReviewPlan`.

Allowed operations:

- `accept_candidate`
- `merge_candidates`
- `split_candidate`
- `discard_candidate_as_non_goal`
- `add_missing_candidate_with_source_anchor`
- `mark_candidate_needs_owner_review`

Every operation must include:

- source candidate refs or source anchors;
- model-authored rationale;
- resulting obligation text when applicable;
- blocking proposal;
- human-readable evidence expectation;
- limitations or ambiguity.

Runtime validation:

- referenced candidates and anchors exist;
- merge/split/add/discard operations are shape-valid;
- added obligations include source anchors;
- discard operations cite non-goal or constraint evidence;
- no runtime ids or lifecycle state are accepted from the model.

## Tool 5: compile_canonical_commitments

Task class: runtime-only `resource_materialization`.

Runtime input:

- compiled candidate set;
- model-authored review plan.

Runtime output: `CanonicalMissionCommitments`.

`CanonicalMissionCommitment` fields:

- `commitmentId`: runtime-assigned stable id.
- `sourceAnchorRefs`: structural anchor refs.
- `operationRefs`: review operations that produced the commitment.
- `ownerLanguageSummary`: model-authored summary.
- `blocking`: model-authored blocking proposal after review.
- `evidenceExpectation`: model-authored human-readable expectation.
- `constraintRefs`: carried from candidates/review operations.
- `limitations`: model-authored limitations.
- `rawStorageFlags`: all false unless explicitly permitted by artifact
  contract, which this flow should not require.

Stable id construction:

- `commitmentId = mission-commitment:${promptHashPrefix}:${anchorDigest}:${operationOrdinal}`
- `anchorDigest` is derived from sorted source anchor refs and excerpt hashes.
- `operationOrdinal` is structural within the accepted review plan.

This id is a runtime identifier, not a runtime semantic judgment. If the model
changes its semantic review, runtime ids change only for commitments whose
source anchors or review operations actually changed.

## Tool 6: accept_mission_ledger

Task class: `global_reasoning` for model sufficiency review plus
runtime-only acceptance gates.

Acceptance gates:

- objective/constraints artifact exists;
- compiled candidate set exists;
- candidate review plan exists;
- canonical commitments artifact exists;
- every canonical commitment has source anchors;
- every blocking commitment has human-readable evidence expectations;
- every nonblocking commitment has rationale;
- source-anchor coverage gaps are either model-reviewed or owner-review
  blockers;
- candidate count, commitment count, and packet count are recorded;
- no raw prompt/provider/tool/command logs are stored;
- no model-authored runtime envelope fields survive.

## Packet Authoring v2

Commitment Work Packets must be created from canonical commitments only.
Models do not decide the packet set.

### author_packet_semantic_brief

Task class: `local_semantic_extraction`.

Fast model input:

- one canonical commitment;
- direct source anchors and bounded excerpts for that commitment;
- objective/constraints summary;
- workflow evidence profile summary;
- context supply policy summary;
- previous accepted packet refs when the commitment depends on another
  commitment.

Fast model output: `PacketSemanticBrief`.

Required semantic fields:

- `handoffObjective`;
- `workerFacingBackground`;
- `requiredContextQuestions`;
- `likelyRepoOrDomainAreas`;
- `implementationExpectations`;
- `validationExpectations`;
- `evidenceClaimExpectations`;
- `stopIfMissingRules`;
- `knownLimitations`.

This is semantic content only. It is not the final packet schema.

### review_packet_brief_substance

Task class: `schema_normalization` plus optional `global_reasoning` only when
the brief is ambiguous enough to affect execution safety.

Runtime first checks structural presence, size, and obvious empty output. The
model may judge substance, but it returns only one of:

- `accepted`;
- `accepted_with_limitations`;
- `needs_repair_blocking`;
- `needs_owner_review`.

Review must name exact fields and reasons. It must not regenerate the packet.

### complete_packet_brief_fields

Task class: `schema_normalization`.

This tool runs only when semantic content is usable but missing bounded fields.
It receives:

- the existing semantic brief;
- missing field paths;
- allowed output schema for only those fields.

It must not regenerate the packet.

### compile_commitment_work_packet

Task class: runtime-only `resource_materialization`.

Runtime compiles the final `CommitmentWorkPacket`:

- packet id;
- commitment id;
- source refs;
- context refs;
- schema fields;
- payload refs;
- storage flags;
- lifecycle state.

Packet count must equal canonical commitment count unless a model-authored
owner-review commitment is explicitly non-executable.

## Provider Rescue Semantics

Proof mode:

- Qwen/fast-model no-content is retried against the same bounded semantic
  packet task when provider diagnostics indicate retry is allowed.
- GPT-5.5 rescue is a proof concern and prevents a clean proof pass unless
  explicitly accepted as a provider incident by owner policy.
- rescue counts are recorded per packet and per phase.

Production mode:

- GPT-5.5 escalation is allowed only as an explicit model policy escalation.
- escalation must record:
  - failed model/provider ref;
  - native finish reason where available;
  - choice count;
  - content length;
  - timeout state;
  - retry count;
  - escalation reason;
  - cost/latency impact;
  - proof cleanliness impact.

This is not fallback success. It is visible, policy-governed escalation.

## Fast-Model No-Content Diagnostic Contract

The staged compiler must retire the catch-all `openrouter_no_content` label
for packet and candidate-boundary calls. That label is acceptable only as a
legacy input symptom; production diagnostics must classify the actual failure
shape.

Required no-content reason classes:

- `provider_timeout`: runtime aborted the provider call before a usable native
  response arrived.
- `transport_error`: network/proxy/provider transport failed before a complete
  response body.
- `empty_choices`: provider returned a response with no choices.
- `empty_content`: provider returned choices but no visible assistant content.
- `parse_dropped_content`: provider response had content bytes, but runtime
  parser/stream extraction produced empty parsed content.
- `schema_mode_failure`: model/provider failed under structured-output/schema
  mode, with freeform content unavailable or rejected.
- `refusal_empty_content`: native refusal/safety fields indicate refusal with
  empty assistant content.
- `preflight_blocked`: runtime policy rejected the call before provider
  dispatch.
- `output_budget_exhausted`: native finish reason/token usage shows the call
  exhausted output budget before producing usable content.
- `runtime_prompt_truncated`: runtime omitted required input refs/excerpts or
  truncated the request bundle before dispatch.
- `wrong_model_or_profile`: dispatched model/provider/reasoning/response mode
  did not match the selected model policy.
- `provider_rate_limited_or_queued`: provider signaled rate limit, queueing,
  overload, or backend saturation.
- `unknown_provider_empty_output`: bounded diagnostics are present, but none
  of the above can be proven.

Every failed fast-model candidate or packet call must persist a bounded
diagnostic record with:

- `modelRef`;
- `providerRef`;
- `providerRequestId` when available;
- `taskClass`;
- `reasoningModeSent`;
- `responseFormatSent`;
- `inputByteCount`;
- `maxOutputTokens`;
- `timeoutMs`;
- `timeoutState`;
- `nativeFinishReason`;
- `choiceCount`;
- `contentLengthByChoice`;
- `parsedContentLength`;
- `retryNumber`;
- `concurrencySlot`;
- `inputBundleRef`;
- `inputBundleHash`;
- `outputHash` when any content exists;
- `classifiedNoContentReason`;
- `eligibleForSameModelRetry`;
- `eligibleForEscalation`;
- `rawPromptStored: false`;
- `rawResponseStored: false`;
- `rawProviderLogStored: false`.

The diagnostic must distinguish:

- model returned empty content;
- provider returned no choices;
- runtime timed out;
- runtime parser dropped content;
- schema mode caused the failure;
- wrong model/profile was used;
- request bundle was too large or malformed;
- retry/escalation policy was invoked.

### Failed-Packet Replay Lane

The implementation must add a replay lane for failed fast-model packet calls.
It reruns only failed candidate/packet semantic tasks from saved bounded input
bundle refs. It must not rerun router, Mission Ledger extraction, candidate
review, graph scheduling, context scout, or implementation work.

Replay outputs:

- comparison of failed and retried input byte counts;
- model/provider/profile actually sent;
- response mode actually sent;
- native finish reason and choice count;
- content length and parsed length;
- whether failure repeats on the same input bundle;
- whether failure correlates with source-anchor count, packet field count,
  prompt excerpt size, schema mode, timeout, or concurrency slot.

This lane is required before Product/Spec resumes if any proof-mode packet
call produces no content twice on the same bounded input bundle.

### Model-Profile Qualification Gate

Qwen or any fast model remains eligible for packet semantic briefs only if the
staged compiler can prove:

- no GPT-5.5 rescue was needed in the clean proof path;
- no-content failures are below the configured proof threshold;
- repeated failures on the same input are classified and either fixed by task
  shape or marked as a provider/model profile blocker;
- the model is not being asked to perform schema construction and semantic
  packet authoring in the same turn;
- reasoning mode, response mode, timeout, and output budget match the
  selected model policy.

If this gate fails, the system must change task shape, model policy, or
provider profile before the Product/Spec proof. It must not hide the issue
behind silent GPT-5.5 rescue.

## Stability Diagnostic v2

The next diagnostic lane must replay the same Product/Spec prompt twice
through:

1. source prompt index;
2. objective/constraints extraction;
3. obligation candidate extraction;
4. candidate set compilation;
5. candidate set review;
6. canonical commitment compilation;
7. Mission Ledger acceptance;
8. packet semantic brief authoring;
9. packet compilation.

Pass conditions:

- same mission gate;
- same canonical blocking commitment count;
- same canonical commitment ids for semantically unchanged source anchors;
- no missing blocking commitment packet;
- packet count equals canonical commitment count;
- zero GPT-5.5 rescue in proof mode, unless proof explicitly reports
  `provider_incident_accepted_by_owner`;
- provider no-content attempts are bounded, classified with the reason classes
  above, and replayable from input bundle refs;
- source-anchor coverage is stable or model-reviewed with explicit rationale;
- no runtime semantic grouping, regex classification, or prompt-specific
  taxonomy appears in code.

Fail conditions:

- changed blocking commitment count without model-reviewed source-anchor
  rationale;
- missing packet coverage;
- packet authoring depends on GPT-5.5 rescue;
- the same fast-model packet input fails twice with unclassified no-content;
- failed fast-model calls lack provider/model/profile/request diagnostics;
- model-authored runtime ids survive;
- raw prompt/provider/tool/command/DB logs are stored;
- diagnostic artifacts cannot hydrate from payload-backed refs.

## Readback Requirements

Work Queue/readback must show:

- current Mission Ledger stage;
- source prompt index ref;
- candidate count;
- candidate review operations count;
- canonical commitment count;
- blocking/nonblocking counts;
- packet count;
- packet authoring model/provider per packet;
- no-content/retry/rescue counts;
- no-content reason class histogram;
- failed-packet replay refs;
- fast-model qualification status;
- proof cleanliness status;
- next legal transition.

The readback must make the difference clear:

- semantic model drift: model-reviewed source-anchor changes;
- provider variance: no-content/retry/timeout/finish reason;
- runtime boundary failure: invalid refs/schema/storage/lifecycle;
- proof failure: rescue dependence or structural mismatch.

## First-Principles Extra Hardening

Before the next Product/Spec proof, add one owner-visible preflight gate:

`mission-ledger-stability-v2-cleanliness-gate`

It should answer:

- Does the full prompt reach the candidate extractor and packet author through
  bounded refs?
- Are canonical commitment ids stable across repeated runs?
- Are packet briefs human-engineer usable without guessing?
- Did any fast-model output require GPT-5.5 rescue?
- Are provider failures diagnosed without hiding behind fallback success?
- Can the proof restart from candidate review or packet authoring boundaries?

If this gate does not pass cleanly, do not proceed to scheduler, context
scout, implementation, validation, or closeout. Downstream failures would be
uninterpretable until this boundary is stable.

## Work Queue Placement

This item belongs immediately after
`openclaw-convergence.mission-ledger-stability-diagnostics` and before
`openclaw-convergence.active-queue-34`.

It supersedes the narrow diagnostic failure as the actionable repair item. The
diagnostic item remains `needs_review` evidence; this item is the
implementation pass that makes the next diagnostic clean.
