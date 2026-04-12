# Model-Native Pass 2 — Runtime Semantic Cutover

## Purpose

Record the concrete execution prompt for Pass 2 of the model-native memory
architecture program.

Pass 2 is the runtime semantic cutover pass.

Its job is to remove lane-local semantic ownership and move live runtime
capture onto one shared model-native semantic path before the later context,
prompt, cache, compaction, governance, and DB-ingestion convergence work.

## Governing Program Context

This prompt is downstream of:

- `docs/memory-system/specs/shared-source-normalization-and-block-typing.md`
- `docs/memory-system/specs/model-driven-semantic-interpretation.md`
- `docs/memory-system/specs/model-native-memory-architecture-program.md`

Pass 2 assumes Pass 1 has already landed successfully:

- structural normalization is structural-only
- source envelopes and provenance are shared contracts
- interpretation contract v2 exists
- the primary benchmark surface is live-model based
- a gold judgment corpus exists
- calibration has established a measured acceptance bar
- heuristic block typing is no longer a semantic decision point in normal
  runtime

## Execution Prompt

```text
You are operating inside the live OpenClaw environment, the canonical workspace, and the engineering repo.

Mission:
Execute Pass 2 of the model-native memory architecture program end-to-end in one continuous implementation pass.

This is an implementation pass, not a planning pass.

Do the work end-to-end.
Do not stop at analysis.
Do not wait for user confirmation between slices.
Use the real current filesystem, repo state, memory runtime, ordinary-turn capture system, document-ingestion service, benchmark surfaces, and current memory docs/specs as source of truth.

Use fast-lane tests only between slices.
Do not run broad repo gates during the slice loop.

Only after all slices in this pass are complete:
- run the full honest landing bar
- commit
- push
- leave the repo in a totally clean worktree state

==================================================
PRIMARY OBJECTIVE
==================================================

Land Pass 2 of the full model-native memory architecture program.

This pass is about runtime semantic cutover.

It must remove the remaining lane-local semantic ownership in live runtime and
move the system onto one shared model-native semantic path for capture.

This pass is successful only if all of the following are true:

- one lane-agnostic semantic planner exists for live capture sources
- canonical memory objects are unified across capture lanes
- review posture is redesigned around model-native evidence, not detector-family quirks
- dedupe and supersession operate on canonical model outputs and normalized provenance
- procedures are model-native structured outputs, not detector-era list tricks
- terse preferences and operator corrections are model-native with shared contextual envelope support
- durable routing/context memories are model-native while reference-only material stays out
- capture services converge on one semantic service boundary
- heuristic semantic classification is removed from normal runtime
- a cross-lane replay harness proves equivalent meaning reaches equivalent outcomes across lanes
- fast-lane validation runs between slices
- no broad full-suite gates are run early
- the final broad landing validation runs only after all slices in this pass are complete
- commit and push happen only after final validation is green
- the repo ends with a totally clean worktree

==================================================
CURRENT GROUND TRUTH
==================================================

Use the real current tree as baseline, not an old plan.

Known expected truth before this pass starts:

- Pass 1 has already landed
- normalization is structural-only
- source envelope and provenance contracts are shared
- interpretation contract v2 exists
- live-model benchmark harness exists
- gold corpus exists
- calibration bar exists
- heuristic block typing is retired as a normal-runtime semantic decision point

Known remaining truth:

- document and ordinary-turn runtime semantics still need to converge further
- canonical memory-object handling still needs to be made lane-agnostic
- review policy, dedupe, supersession, and capture-service ownership still need to move onto model-native evidence
- detector-era semantic modules and branches still survive in normal runtime unless this pass removes them

Treat the following specs as governing inputs for this pass:

- `docs/memory-system/specs/shared-source-normalization-and-block-typing.md`
- `docs/memory-system/specs/model-driven-semantic-interpretation.md`
- `docs/memory-system/specs/model-native-memory-architecture-program.md`
- the Pass 1 slice specs that were written or updated during the previous pass

==================================================
GUIDING STANCE
==================================================

Err on the side of one shared semantic planner.
Err on the side of one canonical object path.
Err on the side of evidence-based review posture.
Err on the side of model-native capture for procedures, preferences, corrections, and routing.
Err on the side of deleting runtime heuristic ownership once the replacement is strong enough.
Err on the side of proving lane parity on meaning, not on incidental fixture similarity.

Do not settle for:
- document and ordinary-turn capture sharing types but not truly sharing semantics
- lane-specific canonicalization forks at submission time
- review routing still driven by detector-family quirks
- procedure capture that is still secretly list heuristics in disguise
- preference and correction capture that still depends on detector-era reply forests
- routing capture that becomes a noisy reference catch-all
- heuristic semantic modules remaining in normal runtime while the pass claims full cutover

==================================================
ABSOLUTE RULES
==================================================

1. Implement the slices in the required order.
2. Before or alongside implementation of each slice, write or expand its in-depth spec in `docs/memory-system/specs/`.
3. Update roadmap/status/decision/index docs as the pass progresses so the architecture record stays current.
4. Use fast-lane validation only between slices.
5. Do not run full `pnpm test` during the slice loop.
6. Do not run full `pnpm build` during the slice loop.
7. Do not run `pnpm check` during the slice loop.
8. Preserve behavior unless the behavior being replaced is explicitly the target of this cutover.
9. Respect dirty worktrees.
10. Do not revert unrelated changes.
11. No destructive git commands.
12. Do not edit `docs/zh-CN/**`.
13. Do not commit between slices.
14. Do not push between slices.
15. After final landing validation is green, commit using `scripts/committer`.
16. Push to GitHub.
17. If origin is not writable, push to the configured writable fork and report exactly what happened.
18. If main has moved, rebase cleanly before pushing. Do not create merge commits on main.
19. End with a totally clean worktree.
20. If normal runtime still depends materially on heuristic semantic classification at the end of this pass, the pass is not done.
21. If document and turn capture still have meaningfully different semantic-planning personalities where this pass intended to unify them, the pass is not done.

==================================================
DOCUMENTATION REQUIREMENT
==================================================

For each slice below, do all of the following:

- write or expand a dedicated spec in `docs/memory-system/specs/`
- make the spec concrete enough to guide implementation, tests, migration, and deletion
- include:
  - problem statement
  - goals
  - non-goals
  - architecture boundary
  - proposed data contracts
  - runtime ownership
  - migration strategy
  - validation strategy
  - risks/open questions
  - explicit rewrite targets where applicable
  - explicit deletion targets where applicable

Also update the key memory docs and indices so the slice work is visible. At minimum inspect and update, if justified by current tree:

- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/specs/README.md`

Keep those updates concise, but accurate and discoverable.

==================================================
REQUIRED SLICE ORDER
==================================================

You must execute these slices in this exact order.

------------------------------------------
SLICE 15 — LANE-AGNOSTIC SEMANTIC PLANNER
------------------------------------------

Goal:
Make one semantic planner for all capture sources, not separate document and turn flavors.

Required result:
- one planner exists for all capture sources
- lane-specific logic becomes orchestration only
- semantic planning ownership is centralized

Primary likely target surfaces:
- `extensions/memory-middleware/src/memory-semantic-planner.ts`
- document-ingestion planner entrypoints
- ordinary-turn capture semantic planning entrypoints
- any lane-local plan-summary or planner wrappers that still encode semantic differences

Spec requirement:
Write or expand the lane-agnostic semantic planner spec.

Success bar:
- one planner owns semantic planning
- document and turn stop having distinct semantic-planning personalities

Validation after Slice 15:
- targeted planner tests
- targeted cross-source tests
- `pnpm check:types` if justified

------------------------------------------
SLICE 16 — CANONICAL MEMORY-OBJECT UNIFICATION
------------------------------------------

Goal:
Ensure every capture source lands into one shared canonical candidate/object path with no lane-specific semantic forks.

Required result:
- one canonical object path exists
- document, turn, correction, and other capture sources all land the same way
- semantic class differences do not create lane-specific storage logic

Primary likely target surfaces:
- canonical candidate builders
- canonical compatibility builders
- submission path adapters
- document and ordinary-turn capture submission bridges

Spec requirement:
Write or expand the canonical memory-object unification spec.

Success bar:
- canonical objects are lane-agnostic
- semantic forks at submission time are removed

Validation after Slice 16:
- targeted candidate/object tests
- targeted submission path tests
- `pnpm check:types` if justified

------------------------------------------
SLICE 17 — REVIEW-POLICY REDESIGN
------------------------------------------

Goal:
Make review posture depend on model confidence, provenance strength, class risk, and novelty, not detector family quirks.

Required result:
- review policy is redesigned around model-native evidence
- detector-era family quirks stop driving review behavior

Primary likely target surfaces:
- review policy and routing seams
- candidate review metadata and routing
- any review posture helpers that still branch by detector-family behavior

Spec requirement:
Write or expand the review-policy redesign spec.

Success bar:
- review posture is evidence-based
- class, risk, confidence, provenance, and novelty drive routing decisions

Validation after Slice 17:
- targeted review policy tests
- targeted approval/routing tests

------------------------------------------
SLICE 18 — DEDUPE AND SUPERSESSION REDESIGN
------------------------------------------

Goal:
Move dedupe/supersession to operate on canonical model outputs and normalized provenance, not detector-family artifacts.

Required result:
- dedupe/supersession no longer depend on detector-era identity structures
- model-native canonical statements/procedures and provenance drive overlap resolution

Primary likely target surfaces:
- dedupe helpers
- correction and supersession seams
- overlap resolution around candidate submission and approval

Spec requirement:
Write or expand the dedupe and supersession redesign spec.

Success bar:
- dedupe/supersession are model-native
- obsolete detector-family identity assumptions are removed

Validation after Slice 18:
- targeted dedupe/supersession tests
- `pnpm check:types` if justified

------------------------------------------
SLICE 19 — MODEL-NATIVE PROCEDURE EXTRACTION
------------------------------------------

Goal:
Treat procedures as structured model outputs over blocks, not list heuristics plus resolver tricks.

Required result:
- procedures are first-class structured model outputs
- procedure extraction is not assembled from detector-era list logic

Primary likely target surfaces:
- procedure semantic output contracts
- procedure canonicalization
- document and ordinary-turn procedure capture surfaces

Spec requirement:
Write or expand the model-native procedure extraction spec.

Success bar:
- procedures are semantically interpreted as procedures
- list heuristics no longer substitute for actual procedure understanding

Validation after Slice 19:
- targeted procedure tests
- targeted real-document procedure benchmark reruns

------------------------------------------
SLICE 20 — MODEL-NATIVE PREFERENCE AND CORRECTION CAPTURE
------------------------------------------

Goal:
Make terse reply-form preferences and operator corrections fully model-owned with contextual envelope support.

Required result:
- terse conversational corrections and preferences are model-native
- contextual envelope support is shared and explicit

Primary likely target surfaces:
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- shared contextual-envelope seams
- model interpretation and validation surfaces for conversational capture

Spec requirement:
Write or expand the model-native preference/correction capture spec.

Success bar:
- implied-scope corrections and preferences no longer rely on detector-era seam behavior

Validation after Slice 20:
- targeted ordinary-turn tests
- targeted implied-scope benchmark tests

------------------------------------------
SLICE 21 — MODEL-NATIVE ROUTING / REFERENCE INTERPRETATION
------------------------------------------

Goal:
Add a disciplined model-owned decision for durable routing/context memory versus reference-only text.

Required result:
- routing/context memories are model-native
- reference-only material remains excluded
- no generic noisy catch-all reference lane appears

Primary likely target surfaces:
- routing/reference capture logic
- document ingestion profiles where needed
- model interpretation or validation seams for routing decisions

Spec requirement:
Write or expand the model-native routing/reference interpretation spec.

Success bar:
- durable routing memories are captured intentionally
- reference-only text stays out

Validation after Slice 21:
- targeted routing/reference tests
- targeted real-doc benchmark reruns

------------------------------------------
SLICE 22 — CAPTURE-SERVICE CONVERGENCE
------------------------------------------

Goal:
Converge capture services so document, turn, correction, and adjacent capture surfaces rely on one semantic service.

Required result:
- shared capture service boundaries exist
- lane-specific orchestration survives only where necessary

Primary likely target surfaces:
- capture service ports and runtime wiring
- document capture entrypoints
- ordinary-turn capture entrypoints
- adjacent correction/capture seams that still duplicate semantic work

Spec requirement:
Write or expand the capture-service convergence spec.

Success bar:
- capture services stop duplicating semantic work
- one semantic service boundary exists

Validation after Slice 22:
- targeted runtime tests across capture surfaces
- `pnpm check:types` if justified

------------------------------------------
SLICE 27 — FULL HEURISTIC SEMANTIC RETIREMENT
------------------------------------------

Goal:
Delete detector-family semantic classification from normal runtime. Keep only deterministic structure parsing, validation, and maybe a narrowly scoped emergency degraded mode.

Required result:
- heuristic semantic classification is removed from normal runtime
- any remaining deterministic code is clearly governance, safety, or degraded-mode only

Primary likely target surfaces:
- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- `extensions/memory-middleware/src/response-style-semantic.ts`
- `extensions/memory-middleware/src/project-fact-semantic.ts`
- `extensions/memory-middleware/src/recurring-procedure-semantic.ts`
- `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
- any remaining detector-era branches in `ordinary-turn-auto-capture.ts`

Spec requirement:
Write or expand the full heuristic semantic retirement spec.

Success bar:
- the runtime is honestly model-native
- heuristic semantics are no longer the hidden backup engine

Validation after Slice 27:
- targeted negative tests proving normal runtime does not use heuristic semantic classification
- `pnpm check:types` if justified

------------------------------------------
SLICE 28 — CROSS-LANE REPLAY HARNESS
------------------------------------------

Goal:
Replay the same meaning through document, turn, workspace, and retrieval lanes and verify equivalent model-native outcomes.

Required result:
- replay harness exists
- lane parity is evaluated on meaning, not only isolated fixtures

Primary likely target surfaces:
- replay harness or benchmark surfaces
- parity fixtures and real audited cases
- any lane-summary surfaces needed to compare outcomes cleanly

Spec requirement:
Write or expand the cross-lane replay harness spec.

Success bar:
- lane-equivalent meaning can be tested across the system
- remaining cross-lane mismatches are explicit

Validation after Slice 28:
- targeted replay harness tests
- targeted parity runs

==================================================
SLICE EXECUTION REQUIREMENTS
==================================================

For each slice, do all of the following:

1. Diagnose
- identify the structural problem inside the slice
- explain why it is the correct next move

2. Define the seam
- identify the exact runtime/doc/module boundaries to change
- identify which files should be rewritten versus deleted

3. Spec
- write or expand the in-depth slice spec in `docs/memory-system/specs/`
- add concise index pointers from key docs

4. Implement
- land the slice
- remove dead residue exposed by the slice
- do not preserve obsolete architecture because it already exists

5. Fast-lane validate
- run only the smallest honest tests for touched behavior

6. Measure
Record:
- what got materially simpler
- what runtime boundary is clearer
- what duplication or ambiguity was removed
- what files changed/created/deleted
- lines added vs deleted
- hotspot LOC deltas
- tests run and pass/fail
- whether the slice delivered high, medium, low, or diminishing value
- exact rewrite targets
- exact deletion targets

7. Proceed automatically
- do not wait for user confirmation

==================================================
FAST-LANE VALIDATION POLICY BETWEEN SLICES
==================================================

Between slices:
- use only the smallest honest checks for the touched surface
- prefer targeted `pnpm test -- <paths...>`
- use targeted dry-run/evaluation commands where that is the most direct proof
- use `pnpm check:types` only when the touched runtime/type surface justifies it
- do not run full `pnpm test`
- do not run full `pnpm build`
- do not run full `pnpm check`
- do not run `pnpm gate:integration`

If a touched surface has no good targeted test lane:
- add one if reasonable
- otherwise use the next most direct honest validation and report that candidly

==================================================
FULL FINAL LANDING ONLY AFTER ALL SLICES
==================================================

Only after all slices in this pass are complete:

1. run `pnpm check`
2. run `pnpm test`
3. run `pnpm build`

If any of these fail:
- fix the failures if they were caused by this pass or are plausibly related
- if a failure is clearly unrelated preexisting repo debt, report it candidly and stop before push

If all green:
- create the commit with `scripts/committer`
- push to GitHub
- if origin is not writable, push to the configured writable fork and report exactly what happened

Hard rule:
Do not run the full landing gates before all slices are complete.

==================================================
CLEAN WORKTREE REQUIREMENT
==================================================

The end state must be a totally clean worktree.

That means:
- all intended work from this pass is committed
- no tracked files remain modified
- no new intended files remain untracked
- no partial implementation residue remains in the tree

If unrelated preexisting dirt prevents a clean worktree:
- separate it explicitly
- either land it cleanly first if it is required and safe
- or report it as a blocker before final push
- do not hand-wave a dirty tree as acceptable

==================================================
GIT / LANDING DISCIPLINE
==================================================

- start by checking worktree status
- preserve unrelated dirt unless it must be resolved to achieve the clean landing
- do not revert unrelated changes casually
- do not use destructive git commands
- do not commit between slices
- do not push between slices
- after full final validation is green:
  - commit with `scripts/committer`
  - push
- if main has moved, rebase cleanly before pushing
- do not create merge commits on main

==================================================
MEASUREMENT REQUIREMENT
==================================================

At minimum report:

For each slice:
- exact slice focus
- exact runtime seam changed
- exact spec file written or updated
- exact files changed/created/deleted
- exact fast-lane tests run
- exact measurement summary
- exact why-this-next rationale
- exact rewrite targets
- exact deletion targets

Final:
- exact full landing validation run
- exact validation results
- exact commit(s) created
- exact push result
- exact final worktree status
- any deferred follow-up, if anything remains

==================================================
FINAL REPORT FORMAT
==================================================

At the end, provide a complete report with:

1. executive summary
2. exact work completed in Slice 15
3. exact work completed in Slice 16
4. exact work completed in Slice 17
5. exact work completed in Slice 18
6. exact work completed in Slice 19
7. exact work completed in Slice 20
8. exact work completed in Slice 21
9. exact work completed in Slice 22
10. exact work completed in Slice 27
11. exact work completed in Slice 28
12. exact files changed/created/deleted
13. exact specs written/updated
14. exact roadmap/status/index/decision docs updated
15. exact architecture changes made
16. exact lane-agnostic semantic planner changes landed
17. exact canonical memory-object unification changes landed
18. exact review-policy redesign changes landed
19. exact dedupe/supersession redesign changes landed
20. exact model-native procedure, preference, correction, and routing changes landed
21. exact capture-service convergence changes landed
22. exact heuristic semantic retirement changes landed
23. exact cross-lane replay changes landed
24. exact fast-lane tests run between slices
25. exact full final landing validation run at the end
26. exact validation results
27. exact commit(s) created
28. exact push result
29. final repo/worktree status
30. what remains for Pass 3

Also include ELI5 sections:
- ELI5 — why one semantic planner had to replace lane-specific planning
- ELI5 — why canonical memory objects had to become lane-agnostic
- ELI5 — why review posture had to move from detector quirks to model-native evidence
- ELI5 — why dedupe and supersession had to be rebuilt on canonical outputs
- ELI5 — why procedures had to become structured model outputs
- ELI5 — why preferences and corrections needed model-native contextual handling
- ELI5 — why routing/reference interpretation needed a disciplined model-owned decision
- ELI5 — why heuristic semantic retirement mattered
- ELI5 — why replay harnesses matter for lane parity
- ELI5 — why full test/build/landing waited until the end

Also include practical examples of:
- old lane-local semantic planner vs new lane-agnostic planner
- old lane-specific object path vs new canonical object path
- old detector-driven review behavior vs new evidence-driven review behavior
- one model-native procedure extraction example
- one implied-scope preference or correction example
- one routing/context memory that should be captured vs one reference-only sentence that should stay out
- one case where old detector-era dedupe would differ from model-native canonical dedupe
- one cross-lane replay example
- one example of heuristic semantic code deleted in this pass

==================================================
FINAL SUCCESS BAR
==================================================

This pass is successful only if:

- all required slices are completed in order
- in-depth specs are written or expanded for every slice and stored in the memory spec folder
- key roadmap/status/index/decision docs are updated and linked
- fast-lane validation ran between slices
- no broad landing gates ran early
- the full landing bar ran only after all slices were complete
- the repo landed green
- commit and push happened only after green final validation
- the worktree is totally clean at the end
- the final report is complete, candid, and technically precise

One strictness note:
If the system ends this pass still depending materially on heuristic semantic classification in normal runtime, or if document and turn capture still preserve different semantic-planning personalities where this pass intended to unify them, the correct result is not “close enough.” The correct result is that Pass 2 is not done.
```
