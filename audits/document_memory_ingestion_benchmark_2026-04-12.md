# Document Memory Ingestion Benchmark

Date: 2026-04-12

## Purpose

Validate the document memory ingestion planner against explicit expected-memory judgments before any real bulk document ingestion into canonical DB memory.

This benchmark is intentionally allowed to fail. It exists to answer whether the planner is strong enough for limited first-wave bulk ingestion.

## Benchmark Criteria

1. Every benchmark case must hit its exact candidate count.
2. Expected category counts must match exactly for each case.
3. Every required durable memory must be present with the right category and useful canonical wording.
4. Forbidden filler/reference-only material must not be emitted as a candidate.
5. Where provenance is expected, heading path and source line must match the expected source region.
6. Where dedupe is expected, the winning candidate must report the required suppressed-duplicate count.

## Representative Evaluation Set

Seven benchmark documents were used:

1. identity document with explicit stable constraints and one concise duplicate
2. identity document with paraphrases plus one non-memory filler line
3. project operating document where project scope and docs scope are carried by headings/context rather than repeated inline
4. workflow runbook with a recurring checklist and readiness rule
5. strategic decision doc with one unmet need, one durable fact, and mixed filler
6. reference-review doc where only one explicit durable reference should survive
7. duplicate workflow-lesson doc where three variants should collapse to one candidate

These cases cover:

- identity / user-preference capture
- project operating capture
- workflow/runbook capture
- strategic/decision capture
- mixed-signal documents
- duplicate/paraphrase-heavy documents
- borderline reference-review behavior

## Initial Baseline Before Hardening

The first benchmark run failed.

The meaningful runtime miss was:

- project-operating docs with implicit scope produced zero candidates when the section headings and source project context carried the scope, but the lines themselves did not restate `For project ...`

Representative failing case:

- input:
  - `Default branch is atlas-main.`
  - `Staging branch is atlas-staging.`
  - `Update the English docs first and rerun docs i18n instead of editing docs/zh-CN directly.`
- expected:
  - 2 project facts
  - 1 project rule
- actual before hardening:
  - 0 candidates

There was also one benchmark-harness issue rather than a runtime issue:

- the paraphrase-heavy identity case assumed the winning plain-English candidate had to preserve the first matching line
- in reality, the stronger surviving variant came from a later paraphrase line
- the benchmark was updated to allow either acceptable source line for that specific deduped case

## Hardening Landed

The runtime hardening focused on contextual raw-candidate generation inside the ingestion service.

Changes made:

- added project-scope inference from:
  - `source.projectId`
  - fallback root heading text with normalized suffix stripping
- added contextual raw candidates for project/workflow/strategic profiles when the visible segment does not restate scope explicitly
- added docs-scoped raw candidates when:
  - the section heading implies docs scope
  - the segment is a docs-localization style instruction
- kept these contextual candidates generic and profile-driven rather than path-hacked

Net effect:

- the planner can now ingest realistic project docs where headings carry durable scope
- the service no longer requires every durable project line to redundantly restate the project name

## Final Benchmark Result

Post-hardening benchmark result:

- blocking issues: 0
- minor issues: 0
- readiness: ready for limited first-wave bulk ingestion

## Expected Vs Actual Results By Case

### 1. Identity explicit and duplicate

Expected:

- exact count: 3
- categories:
  - `response_style`: 3
- required memories:
  - plain English preference
  - concise response preference
  - repo-root-relative file reference rule
- expected dedupe:
  - one concise duplicate suppressed
- expected omission:
  - `remember this later maybe`

Actual:

- count: 3
- categories:
  - `response_style`: 3
- matched:
  - `use plain English`
  - `keep responses concise`
  - `When referencing files in chat, use repo-root relative paths`
- dedupe:
  - concise candidate duplicate count = 1
- omissions:
  - filler line not captured

Judgment:

- pass

### 2. Identity paraphrase-heavy

Expected:

- exact count: 3
- categories:
  - `response_style`: 3
- required memories:
  - plain-English preference from either of the two equivalent paraphrases
  - bullet-point preference
  - direct-answer-first preference
- expected dedupe:
  - plain-English variants collapse to one candidate
- expected omission:
  - `The workflow needs a shorter release window.`

Actual:

- count: 3
- categories:
  - `response_style`: 3
- matched:
  - `use plain English`
  - `use bullet points when listing items`
  - `start with the direct answer first`
- dedupe:
  - plain-English candidate duplicate count = 1
- omission:
  - filler line not captured

Judgment:

- pass

### 3. Project operating with implicit scope

Expected:

- exact count: 3
- categories:
  - `project_fact`: 2
  - `project_rule`: 1
- required memories:
  - default branch = `atlas-main`
  - staging branch = `atlas-staging`
  - docs-localization rule about updating English docs first and rerunning docs i18n

Actual after hardening:

- count: 3
- categories:
  - `project_fact`: 2
  - `project_rule`: 1
- matched:
  - `atlas-main`
  - `atlas-staging`
  - `for project atlas forge, use update the English docs first and rerun docs i18n for docs localization changes instead of edit docs/zh-CN directly`

Judgment:

- pass
- this was the highest-value runtime improvement from the benchmark tranche

### 4. Workflow runbook checklist and readiness

Expected:

- exact count: 2
- categories:
  - `recurring_procedure`: 1
  - `workflow_improvement`: 1
- required memories:
  - rollback verification checklist
  - readiness rule preferring `/readyz` over `/healthz`

Actual:

- count: 2
- categories:
  - `recurring_procedure`: 1
  - `workflow_improvement`: 1
- matched:
  - checklist steps preserved as a single recurring-procedure candidate
  - readiness rule captured as one workflow lesson

Judgment:

- pass

### 5. Strategic decisions mixed signal

Expected:

- exact count: 2
- categories:
  - `unmet_need`: 1
  - `project_fact`: 1
- required memories:
  - release evidence template unmet need
  - documentation URL project fact
- expected omissions:
  - speculative branch-setup commentary
  - generic complaint about rollout messiness

Actual:

- count: 2
- categories:
  - `unmet_need`: 1
  - `project_fact`: 1
- omissions:
  - speculative/filler lines not captured

Judgment:

- pass

### 6. Reference-review borderline

Expected:

- exact count: 1
- categories:
  - `project_fact`: 1
- required memory:
  - explicit documentation URL
- expected omissions:
  - ambiguous package-manager line
  - probabilistic GitHub reference
  - filler line

Actual:

- count: 1
- categories:
  - `project_fact`: 1
- only survivor:
  - explicit documentation URL

Judgment:

- pass

### 7. Workflow duplicate lessons

Expected:

- exact count: 1
- categories:
  - `workflow_improvement`: 1
- required memory:
  - `pnpm test` instead of raw vitest
- expected dedupe:
  - duplicate count at least 2

Actual:

- count: 1
- categories:
  - `workflow_improvement`: 1
- winning candidate:
  - `for repo tests, use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest because the repo test wrapper stays active`
- dedupe:
  - duplicate count = 2

Judgment:

- pass

## Broader Capture Lessons From This Tranche

### What the benchmark confirmed

- bounded response-style capture is sharp enough for identity-style docs
- duplicate suppression is strong enough for repeated response-style and workflow-lesson variants
- recurring-procedure extraction from checklist-style docs is viable
- reference-review posture can stay selective instead of flooding the planner with weak references

### What the benchmark exposed

- document capture was too dependent on every project line restating its project scope explicitly
- realistic project docs often use heading context plus file context instead of repeating `For project ...` on every line

### Broader architectural meaning

That weakness was not only about the bulk-ingestion planner. It exposed a generic capture issue:

- memory extraction needs to understand when durable scope is carried by structure/context rather than by one self-contained sentence

The fix therefore improves the broader memory capture architecture, not just this one planner.

## Go / No-Go Decision

Decision:

- go for limited first-wave bulk ingestion

Scope of that go:

- yes for first-wave sources where durable memory is expected and now benchmarked:
  - workspace bootstrap/identity files
  - live agent-workspace identity files
  - workspace core docs
  - workspace runbooks
  - high-signal workspace project-operating docs
  - narrow strategic memory-system docs

Still defer:

- episodic daily memory notes
- generated rollups
- archives and audits
- broad public docs trees
- runtime-state/data-first imports

## Narrow Next Step Before Real DB Submission

Before executing the real bulk-ingestion pass:

1. turn the inventory groups into explicit source manifests
2. run the planner over those manifests in dry-run mode
3. review the dry-run counts and category mix for obvious blowups
4. only then submit planned candidates into the DB through the canonical submission path

## Follow-Up Live Document Benchmark

The initial benchmark pack above still matters, but it was not enough by itself.

We then ran a second manual expected-vs-actual benchmark against the real live
document `docs/help/testing.md` using the real planner path with the
`workflow_runbook` profile.

### Why this second document mattered

`docs/help/testing.md` is a better generalization test than the first benchmark
fixtures because it mixes:

- recurring procedures
- operational routing
- validation policy
- command-heavy reference sections
- sections that should stay out of memory

It therefore tests whether the planner is actually ready for broader document
ingestion, not only for the earlier controlled benchmark set.

### Manual expectation before planner output

Expected durable memories from `docs/help/testing.md`:

- approximate count:
  - around 8 to 12 useful candidates
- expected category mix:
  - recurring procedures:
    - quick-start loop
    - gate-wrapper or gate-serialization procedure
    - suite-selection decision procedure
    - docs-sanity procedure
    - runtime-change validation procedure
  - reference routing:
    - use `Slice Landing Workflow` for repo-wide validation / proof / landing
    - use `Landing Gate Tiers` for current timing-artifact / landing-bar detail
  - bounded workflow facts or guidance:
    - heavy validation commands share one checkout lock
    - live tests discover credentials through the same CLI/auth path
- expected omissions:
  - model matrices
  - environment variable catalogs
  - provider lists
  - most command inventories and reference-only enumerations

### Runtime hardening added for this follow-up

The second benchmark exposed a generic normalization gap:

- actionable checklist blocks under titles like `Most days:` or `Which suite should I run?`
  were reaching the resolver family without strong enough structured titles
- document routing only recognized a very narrow subset of companion-doc phrasings

The follow-up hardening therefore added:

- contextual checklist-title carry-forward from paragraph labels like
  `Most days:` and `Gate wrapper notes:`
- broader structured-procedure recognition for titled actionable blocks
- broader `For ..., use ...` and `For ..., see ...` routing capture

### Actual planner result after that hardening

Actual result on the full live document:

- count: 4
- categories:
  - `reference_routing`: 1
  - `recurring_procedure`: 3
- matched:
  - routing to `Slice Landing Workflow`
  - gate-wrapper serialization / rerun guidance as one recurring procedure
  - runtime-change validation checklist
  - suite-selection decision table
- notable misses:
  - the `Most days:` quick-start procedure
  - the `Landing Gate Tiers` routing reference
  - docs-sanity guidance
  - credentials / auth-path operational fact

### Judgment

The hardening improved the live-document result from zero candidates to a
non-zero set, but the planner still materially undercaptures this real help doc.

That means:

- the earlier controlled benchmark pack was useful but not sufficient
- broader bulk ingestion is still not ready for documents shaped like this
- the shared source-normalization and block-typing follow-through should now be
  treated as a priority future tranche, not just a nice-to-have note

### Updated readiness posture

Revised decision after the second live-document benchmark:

- no for broader bulk ingestion across operational help docs
- maybe for narrow first-wave sources that still look like the earlier
  benchmarked identity/project/workflow fixtures
- yes for prioritizing the next shared-normalization architecture tranche before
  trusting a wider soak or wider document import
