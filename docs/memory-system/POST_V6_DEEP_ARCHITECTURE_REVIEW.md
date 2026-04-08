# Post-V6 Deep Architecture Review

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- head: `1778ce2231d5713b83663209faf40f769b39fb83`
- worktree: clean before review
- reviewed after flattening batch v6 with the current docs still pointing to
  reduced-profile self-improving capture reevaluation as the next major phase

## Review scope

This review covered the current memory doc pack plus the runtime seams that now
define the substrate:

- family policy and registry authority
- prompt-facing application selection
- transcript/tool ingestion
- recurring-procedure staged substrate
- correction and supersede
- proof adapters and proof runner
- retrieval control plane
- semantic routing
- SQL/query scaffolding
- registry and plugin-boundary contract tests

This was a hyper-critical readiness review, not an implementation slice.

## Current architecture strengths

The following landings are real and should be preserved:

- The shared family policy contract is materially cleaner than before. The SDK
  now carries lifecycle, correction, retrieval, application, semantic-routing,
  and proof policy in one definition surface instead of leaving them scattered
  across middleware tables: `src/plugin-sdk/memory-family-policy.ts:140`,
  `src/plugin-sdk/memory-family-policy.ts:193`, `src/plugin-sdk/memory-family-policy.ts:613`.
- The registry/SDK cleanup around proof-family ownership is real. Phrase proof
  families now derive from family policy instead of living in a second proof
  table: `src/plugin-sdk/memory-family-policy.ts:596`,
  `src/plugin-sdk/memory-family-policy.ts:651`.
- Recurring procedures are no longer a fully separate subsystem. The staged
  substrate made candidate versus validated posture explicit and centralized the
  review -> draft -> validate -> optional supersede flow:
  `extensions/memory-middleware/src/recurring-procedure-staged-substrate.ts:8`,
  `extensions/memory-middleware/src/recurring-procedure-staged-substrate.ts:36`,
  `extensions/memory-middleware/src/recurring-procedure-staged-substrate.ts:56`.
- Proof adapterization is real. Lifecycle inspection and artifact building now
  dispatch through adapters instead of a monolithic proof-family switch:
  `extensions/memory-middleware/src/proof-adapters.ts:63`,
  `extensions/memory-middleware/src/proof-adapters.ts:80`,
  `extensions/memory-middleware/src/proof-adapters.ts:175`,
  `extensions/memory-middleware/src/proof-adapters.ts:225`.
- The retrieval control plane is real enough to be useful. Query normalization,
  intent hints, and family-gated semantic fallback selection now exist in one
  place instead of being fully split: `extensions/memory-middleware/src/retrieval-control-plane.ts:33`,
  `extensions/memory-middleware/src/retrieval-control-plane.ts:95`,
  `extensions/memory-middleware/src/retrieval-control-plane.ts:117`.

Those are not fake wins. They are not enough to justify self-improving capture
yet.

## Critical findings ordered by severity

### 1. Reduced-profile self-improving capture should not proceed next

The docs currently treat reduced-profile self-improving capture reevaluation as
the next honest phase. The code still does not justify that.

The biggest blocker is that application selection is still mostly a static
tool-surface prompt generator, not a retrieval-fed per-item application layer.
`resolveDurableMemoryGuidancePlan(...)` derives search, application, and
capture families from tool availability, not from the actual retrieved memory
set or the current query: `extensions/memory-core/src/behavior-profile.ts:113`.
`buildDurableMemoryApplicationSelectionFromProfile(...)` then turns that into a
selected/suppressed artifact with `queryIntent.kind = "tool_surface_guidance"`:
`extensions/memory-core/src/behavior-profile.ts:148`,
`extensions/memory-core/src/behavior-profile.ts:220`. That artifact is rendered
directly into the prompt every time the durable-memory section is active:
`extensions/memory-core/src/prompt-section.ts:63`,
`extensions/memory-core/src/behavior-profile.ts:242`.

That is structurally better than the old ad hoc prompt prose, but it is still
too prompt-heavy and too static for self-improving capture pressure. If
capture starts feeding more material into the same system, the current
application layer will either inflate prompt cost or force another rewrite to
become properly query-aware.

### 2. Request-path cost is still too high for a capture-heavy future

The retrieval path still does too much expensive work on demand.

`applyHybridRetrievalControlPlane(...)` runs semantic fallback families
serially: `extensions/memory-middleware/src/retrieval-control-plane.ts:232`.
Each semantic fallback lane re-embeds the query and may ensure embeddings on
the request path before running semantic search:

- procedure source embedding path:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:661`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:672`
- environment fallback:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1206`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1219`
- workflow-tool-gotcha fallback:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1316`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1329`
- api-workaround fallback:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1426`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1439`

This is not just architectural ugliness. It is the wrong hot-path shape for a
future where capture increases memory volume and retrieval frequency.

The database access layer has the same problem. `withConfiguredClient(...)`
opens and closes a fresh `pg.Client` for each call:
`extensions/memory-middleware/src/db/queries.ts:2927`. That pattern is still
repeated directly in many hot or semi-hot paths:

- candidate writes:
  `extensions/memory-middleware/src/db/queries.ts:3067`
- transcript auto-capture attribution and duplicate lookup:
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:1599`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:1680`
- tool duplicate lookup:
  `extensions/memory-middleware/src/tools/candidate-submit.ts:3493`
- recurring procedure lifecycle:
  `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts:81`,
  `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts:245`
- correction execution:
  `extensions/memory-middleware/src/memory-correction-engine.ts:209`

That connect/query/end pattern is survivable at current scale. It is a bad bet
for self-improving capture.

### 3. The two biggest orchestration surfaces are still monoliths and still too branch-heavy

The substrate is flatter, but the two most important write-path orchestrators
are still giant, family-heavy control files:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

In auto-capture, the code still mixes transcript scanning, attribution,
duplicate detection, capture metadata shaping, family-specific rejection,
auto-promotion, phrase induction, and workflow/procedure branching in one file.
Examples:

- transcript scanning and backward JSONL parsing:
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:904`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:936`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:4795`
- family-specific metadata branching:
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:1984`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:2035`
- response-style and procedure-specific review/promotion flows:
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:2115`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:2259`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:2299`

The tool-side submitter has the same smell. It still owns recurring-procedure
staged inspection, workflow semantic side effects, input normalization, and
duplicate lookup in one large branchy surface:
`extensions/memory-middleware/src/tools/candidate-submit.ts:1133`,
`extensions/memory-middleware/src/tools/candidate-submit.ts:1670`,
`extensions/memory-middleware/src/tools/candidate-submit.ts:1758`,
`extensions/memory-middleware/src/tools/candidate-submit.ts:3493`.

These files are now the most likely future regression surfaces. If
self-improving capture lands next, it will almost certainly increase pressure
on exactly these two monoliths.

### 4. Retrieval policy is flatter than before, but query shaping still re-derives too much family meaning from metadata strings

The control plane exists, but downstream retrieval still reconstructs family
identity from stored metadata shape instead of consuming a cleaner,
materialized family signal.

`classifyProjectRetrievedFamily(...)` determines project memory family by
walking nested metadata keys like `autoCapture.lessonFamily`,
`candidateMetadata.autoCapture.lessonFamily`, and `promotionMetadata...`:
`extensions/memory-middleware/src/db/queries.ts:1681`.

The retrieval feature framework is also still part registry, part hardcoded SQL
family knowledge:

- hardcoded approved-memory family guards:
  `extensions/memory-middleware/src/retrieval-feature-framework.ts:51`
- hardcoded intent guards:
  `extensions/memory-middleware/src/retrieval-feature-framework.ts:71`
- special-case feature value expressions:
  `extensions/memory-middleware/src/retrieval-feature-framework.ts:87`

This is not catastrophic today. It is still too indirect and too metadata-shape
sensitive for later scale or extension work.

### 5. Proof execution remains under-tested relative to its complexity

`runMemoryProofPlan(...)` is the real proof executor. It captures transcripts,
reviews candidates, promotes memory/procedures, validates procedures, runs
hybrid search, and snapshots gateway health:
`extensions/memory-middleware/src/proof-runner.ts:807`.

The current tests do not match that runtime risk. The test file covers plan
parsing and helper behavior, but not end-to-end execution of
`runMemoryProofPlan(...)`:
`extensions/memory-middleware/src/proof-runner.test.ts:8`,
`extensions/memory-middleware/src/proof-runner.test.ts:302`.

That makes proofing look cleaner than it is. Under more families, more
evidence types, or more production proof use, this is a regression risk.

## Architectural inefficiencies

- The prompt-facing application-selection layer is still a bridge being treated
  as more finished than it is. The docs already admit it is not the final
  retrieval-fed substrate, but the current sequencing is still too optimistic
  about what that means in practice.
- The retrieval control plane is partly honest and partly still a dispatcher
  into multiple expensive lane-specific fallbacks:
  `extensions/memory-middleware/src/retrieval-control-plane.ts:76`,
  `extensions/memory-middleware/src/retrieval-control-plane.ts:219`.
- Retrieval feature composition remains partly declarative and partly encoded in
  SQL helper switches. That will stay annoying whenever retrieval semantics
  change for a family.
- The request/write orchestration boundary is still too centralized in
  `ordinary-turn-auto-capture.ts` and `candidate-submit.ts`. Those files are
  no longer the old architecture, but they still carry too much substrate
  ownership for healthy evolution.

## Compute inefficiencies

- repeated DB connect/query/end cycles instead of pooled reuse:
  `extensions/memory-middleware/src/db/queries.ts:2927`
- repeated query embedding across semantic fallback lanes:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1206`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1316`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1426`
- request-path embedding backfill/ensure work:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1219`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1329`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1439`
- transcript rescans and whole-file backward parsing for ordinary-turn capture:
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:904`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:936`,
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts:4815`

None of these are fatal alone. Together they are the wrong performance profile
for self-improving capture.

## Token-efficiency concerns

- The prompt-facing durable-memory section is still long and mostly static once
  the memory tools are available:
  `extensions/memory-core/src/behavior-profile.ts:245`
  through `extensions/memory-core/src/behavior-profile.ts:312`.
- The rendering path always emits generic durable-memory guidance plus
  selected-family guidance when the section is enabled:
  `extensions/memory-core/src/prompt-section.ts:63`.
- The current selection artifact tracks suppressed items, but the rendered
  output does not yet look token-budgeted or evidence-budgeted. It looks like a
  safer, typed way to produce a long memory instruction block.

This is the wrong place to add self-improving capture pressure unless the
system first becomes cheaper and more query-aware.

## Retrieval/query-scale concerns

- Project-family shaping still depends on post-query record reshaping instead of
  a fully materialized family read surface:
  `extensions/memory-middleware/src/retrieval-control-plane.ts:150`,
  `extensions/memory-middleware/src/db/queries.ts:1744`.
- Retrieval feature SQL still contains family-specific guards and special cases:
  `extensions/memory-middleware/src/retrieval-feature-framework.ts:51`,
  `extensions/memory-middleware/src/retrieval-feature-framework.ts:71`,
  `extensions/memory-middleware/src/retrieval-feature-framework.ts:87`.
- Semantic fallback lanes all re-run similar search-and-merge logic with only
  family-specific filters changed:
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1230`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1340`,
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts:1450`.

The deeper SQL normalization landed in v6 was honest. It did not finish the
retrieval cost problem.

## Proof/review-scale concerns

- The adapter model is good. The executor still centralizes step sequencing,
  cross-step result tracking, and health snapshot orchestration:
  `extensions/memory-middleware/src/proof-runner.ts:815`.
- The proof runner will become awkward faster than the adapters if more step
  kinds, evidence types, or conditional proof branches are added.
- The current tests do not pressure the executor path enough to make future
  proof changes cheap and safe.

## Boundary and contract concerns

- The shared family policy contract is materially improved and should stay in
  the SDK. That work looks done enough to stop churning for now:
  `src/plugin-sdk/memory-family-policy.ts:193`,
  `src/plugin-sdk/memory-family-policy.ts:605`.
- The boundary smell that remains is not “wrong package owns the contract.”
  It is “runtime layers still reinterpret the contract too often.”
- In other words, the boundary file moved to the right place, but some runtime
  seams still consume it through local adapters plus extra metadata inference
  instead of through cleaner materialized runtime shape.

## Testability and regression concerns

- proof execution is under-tested relative to complexity:
  `extensions/memory-middleware/src/proof-runner.ts:807`,
  `extensions/memory-middleware/src/proof-runner.test.ts:8`
- the two biggest orchestration files are still large enough that behavioral
  drift is easy to introduce accidentally:
  `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`,
  `extensions/memory-middleware/src/tools/candidate-submit.ts`
- retrieval behavior still splits responsibility across control decision,
  SQL feature framework, query shaping, and semantic fallback merge logic,
  which makes it easy to change behavior accidentally in only one layer

## Things that should not be flattened further

- Procedures should remain structurally distinct in direct-use policy and in
  validated-procedure artifact posture.
- Phrase-pattern proof families should remain distinct from ordinary memory
  objects. The current proof policy model captures that honestly:
  `src/plugin-sdk/memory-family-policy.ts:183`,
  `src/plugin-sdk/memory-family-policy.ts:596`.
- The proof adapter boundary should remain. Flattening it back into one giant
  executor switch would be regression.
- Validated procedures and ordinary approved memory objects should not be forced
  into one fake read model just to make SQL look prettier.

## Explicit judgment on self-improving capture readiness

Do not proceed to reduced-profile self-improving capture next.

The substrate is flatter than before, but it is not yet cheap enough, simple
enough, or query-aware enough to absorb self-improving capture pressure
cleanly.

The specific blockers are:

1. the application layer is still mostly prompt-facing static guidance
2. semantic fallback still does too much work on the request path
3. DB access still pays too much per-call connection overhead
4. the two biggest write-path orchestrators are still too monolithic
5. proof execution is not tested deeply enough for the next risk phase

## Recommended next work sequence

1. Request-path cost hardening
   - introduce pooled DB access for memory middleware hot paths
   - move semantic embedding backfill/ensure fully off the request path
   - reuse query embeddings across semantic fallback families
2. Application/token-efficiency hardening
   - make application selection more query-aware and retrieval-fed
   - add real token-budget pressure to durable-memory prompt rendering
   - stop emitting broad durable-memory guidance when the current run does not
     need it
3. Orchestration/test hardening
   - decompose `ordinary-turn-auto-capture.ts`
   - decompose `candidate-submit.ts`
   - add executor-level proof-runner tests for `runMemoryProofPlan(...)`
4. Only after those are proven, reevaluate reduced-profile self-improving
   capture again

## What to defer

- new families
- learned-guidance advisory planning
- broad procedure/read-model convergence unless later pressure proves it is
  still necessary
- more flattening for its own sake where current policy differences are honest

## What to stop doing

- stop treating prompt-facing application selection as if it already solves the
  full application substrate problem
- stop treating flattened control-plane landings as proof that request-path
  cost is acceptable
- stop treating the absence of core flattening slices as proof that the next
  roadmap phase is safe

## What surprised you most in the current codebase

The biggest surprise is how much of the remaining risk is no longer about
policy correctness. It is about hot-path cost and orchestration bulk.

The architecture is more honest than it was before v4-v6. The next failure mode
is not “wrong family model.” It is “too much work, in too many places, on too
many ordinary turns.”
