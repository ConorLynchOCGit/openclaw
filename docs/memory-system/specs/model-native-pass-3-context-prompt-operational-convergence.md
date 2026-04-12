# Model-Native Pass 3 — Context, Prompt, And Operational Convergence

## Purpose

Record the concrete execution prompt for Pass 3 of the model-native memory
architecture program.

Pass 3 is the context, prompt, operational, ingestion, soak, and slimming
pass.

Its job is to converge the broader context-control-plane architecture on top of
the already-landed model-native capture runtime so the system no longer treats
memory as a side bridge and no longer carries detector-era cache, compaction,
governance, ingestion, soak, or code-volume residue.

## Governing Program Context

This prompt is downstream of:

- `docs/memory-system/specs/shared-source-normalization-and-block-typing.md`
- `docs/memory-system/specs/model-driven-semantic-interpretation.md`
- `docs/memory-system/specs/model-native-memory-architecture-program.md`
- `docs/memory-system/specs/model-native-pass-2-runtime-semantic-cutover.md`

Pass 3 assumes Pass 1 and Pass 2 have already landed successfully:

- normalization is structural-only
- source envelope and provenance contracts are shared
- interpretation contract v2 exists
- benchmarking is live-model-based and calibrated against a gold corpus
- normal runtime capture uses one lane-agnostic model-native semantic planner
- canonical memory objects are lane-agnostic
- review, dedupe, supersession, procedures, preferences, corrections, and
  routing are model-native
- heuristic semantic classification is retired from normal runtime
- cross-lane replay proof exists

## Execution Prompt

```text
You are operating inside the live OpenClaw environment, the canonical workspace, and the engineering repo.

Mission:
Execute Pass 3 of the model-native memory architecture program end-to-end in one continuous implementation pass.

This is an implementation pass, not a planning pass.

Do the work end-to-end.
Do not stop at analysis.
Do not wait for user confirmation between slices.
Use the real current filesystem, repo state, memory runtime, context engine, prompt assembly path, cache surfaces, compaction path, governance surfaces, ingestion surfaces, soak harness surfaces, and current memory docs/specs as source of truth.

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

Land Pass 3 of the full model-native memory architecture program.

This pass is about context, prompt, operational, ingestion, soak, and code-sl slimming convergence.

It must finish the control-plane cutover so the system becomes genuinely model-native not only at capture time, but across:

- context assembly
- prompt assembly
- prompt cache ownership
- context compaction
- outcome proof
- cost and latency control
- failure handling
- governance and approval
- DB-native ingestion
- soak over genuine DB memory
- post-cutover deletion and code slimming

This pass is successful only if all of the following are true:

- one context planner owns context assembly across memory, workspace excerpts, summaries, tool traces, and prompt segments
- prompt caching is redesigned around normalized/model-native artifacts, not lane-local prompt fragments
- compaction operates on canonical normalized/model-native units with deterministic audit trails afterward
- outcome proof measures model-native rationale, application evidence, accepted retrievals, and later correction avoidance
- explicit cost and latency controls make the model-native runtime operationally viable
- failure-mode policy is explicit and does not silently revive heuristic semantic ownership
- governance, quarantine, promotion, and audit trails are explicit and first-class
- DB-native document ingestion uses the canonical model-native path
- soak runs against genuine DB-backed canonical memory
- obsolete resolvers, detector helpers, benchmark shims, transitional comparison scaffolding, and lane-local semantic residue are materially deleted
- code volume drops materially in the post-cutover slimming tranche
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
- Pass 2 has already landed
- normalization is structural-only
- source envelope, provenance, and interpretation contracts are shared
- live-model benchmark and gold corpus exist
- normal runtime capture uses one model-native semantic planner
- canonical memory objects are lane-agnostic
- heuristic semantic classification is retired from normal runtime

Known remaining truth:

- context assembly may still treat memory as a narrower side bridge
- prompt cache ownership may still reflect older prompt-fragment architecture
- compaction may still operate on mixed-era runtime units
- outcome proof may still be too proxy-heavy
- operational cost, failure, and governance control still need explicit model-native ownership
- DB ingestion and soak still need to move onto the model-native stack
- transition scaffolding and obsolete code still need to be deleted

Treat the following specs as governing inputs for this pass:

- `docs/memory-system/specs/shared-source-normalization-and-block-typing.md`
- `docs/memory-system/specs/model-driven-semantic-interpretation.md`
- `docs/memory-system/specs/model-native-memory-architecture-program.md`
- `docs/memory-system/specs/model-native-pass-2-runtime-semantic-cutover.md`
- the Pass 1 and Pass 2 slice specs that were written or updated during the previous passes

==================================================
GUIDING STANCE
==================================================

Err on the side of one context planner.
Err on the side of one prompt/cache/compaction control plane aligned to canonical artifacts.
Err on the side of explicit model-native operational policy.
Err on the side of DB-native ingestion only after upstream semantic cutover is real.
Err on the side of valid soak over genuine DB-backed memory, not synthetic partial-proof soak.
Err on the side of deleting transitional code once the new architecture is real.

Do not settle for:
- memory still behaving like a side attachment to prompt assembly
- prompt caching that still thinks in lane-local fragments
- compaction that still works on detector-era leftovers
- outcome proof that mostly counts proxies while stronger model-native evidence exists
- fallback behavior that silently restores heuristic semantic ownership
- governance hidden in ad hoc branches
- DB ingestion on a mixed-era path
- soak over incomplete or non-canonical memory
- a pass that adds more architecture but does not repay transition-code debt

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
20. If DB ingestion at the end of this pass still depends materially on the old heuristic-era architecture, the pass is not done.
21. If soak at the end of this pass still does not exercise genuine DB-backed canonical memory, the pass is not done.
22. If the post-cutover slimming tranche does not materially reduce obsolete transition code, the pass is not done.

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
SLICE 23 — CONTEXT-PLANNER CONVERGENCE
------------------------------------------

Goal:
Make memory, workspace excerpts, summaries, tool traces, and prompt segments all flow through one context planner with shared segment contracts.

Required result:
- one context planner owns context assembly
- memory is no longer a side bridge
- prompt assembly is driven by shared segment contracts

Primary likely target surfaces:
- current context-control-plane and prompt-context compilation surfaces
- runtime wiring around prompt assembly
- any adjacent context-segment or prompt-report seams that still reflect side-bridge ownership

Spec requirement:
Write or expand the context-planner convergence spec.

Success bar:
- memory/context/prompt assembly are one control plane
- segment ownership and source semantics are shared

Validation after Slice 23:
- targeted context planner tests
- targeted prompt assembly/report tests
- `pnpm check:types` if justified

------------------------------------------
SLICE 24 — PROMPT CACHE REDESIGN
------------------------------------------

Goal:
Cache normalized-context artifacts and model interpretation artifacts explicitly, instead of caching lane-local prompt fragments.

Required result:
- prompt cache model is redesigned around canonical artifacts
- cache entries align with shared normalization and model interpretation boundaries

Primary likely target surfaces:
- prompt artifact/cache seams
- planner reuse surfaces
- prompt report/cache diagnostics that should now reflect canonical artifact ownership

Spec requirement:
Write or expand the prompt cache redesign spec.

Success bar:
- cache ownership matches the new architecture
- stale lane-local fragment caching is reduced or removed

Validation after Slice 24:
- targeted cache tests
- targeted prompt planner/cache reuse tests

------------------------------------------
SLICE 25 — CONTEXT COMPACTION REDESIGN
------------------------------------------

Goal:
Use model-native consolidation for over-budget context and memory clusters, with deterministic storage and audit trails afterward.

Required result:
- compaction is redesigned around canonical normalized/model-native units
- deterministic trails remain for audit and safety

Primary likely target surfaces:
- compaction planning and execution
- session memory compaction
- any budget/overflow seams that still think in mixed-era units

Spec requirement:
Write or expand the context compaction redesign spec.

Success bar:
- compaction aligns with the model-native control plane
- budget/overflow behavior works on canonical units, not detector-era leftovers

Validation after Slice 25:
- targeted compaction tests
- targeted budget/overflow tests

------------------------------------------
SLICE 26 — OUTCOME-PROOF REDESIGN
------------------------------------------

Goal:
Track not just attachment and survival, but model-produced rationale, accepted retrievals, later correction avoidance, and application evidence.

Required result:
- outcome proof is redesigned around model-native semantics and downstream usefulness
- proxy-only counters are reduced

Primary likely target surfaces:
- outcome tracker
- outcome proof
- soak telemetry and operator-facing reporting

Spec requirement:
Write or expand the outcome-proof redesign spec.

Success bar:
- operator reporting better answers whether memory actually helped
- proof becomes more causal and less detector-era/proxy-shaped

Validation after Slice 26:
- targeted outcome-proof tests
- targeted telemetry/reporting tests

------------------------------------------
SLICE 29 — COST AND LATENCY CONTROL PLANE
------------------------------------------

Goal:
Add batching, memoization, prompt compression, and cache policy so model-native interpretation is operationally viable.

Required result:
- model-native runtime has explicit cost/latency controls
- operational viability is designed into the control plane

Primary likely target surfaces:
- interpreter orchestration
- planner batching
- memoization or cache policy
- any adjacent runtime controls needed to keep the model-native path operationally credible

Spec requirement:
Write or expand the cost and latency control plane spec.

Success bar:
- model-native runtime is not just semantically better, but operationally credible

Validation after Slice 29:
- targeted cost/cache/batching tests
- targeted planner/runtime dry-runs

------------------------------------------
SLICE 30 — FAILURE-MODE POLICY
------------------------------------------

Goal:
Define what happens when the model is unavailable, malformed, low-confidence, or too expensive.

Required result:
- failure-mode policy is explicit
- degraded mode, quarantine, no-op, retry, or review posture are clearly defined
- deterministic backup posture exists only where justified

Primary likely target surfaces:
- interpreter failure handling
- review/quarantine/no-op routing
- runtime policy surfaces where degraded behavior must be made explicit

Spec requirement:
Write or expand the failure-mode policy spec.

Success bar:
- the system has an explicit non-legacy reasoned fallback policy
- failure handling does not silently revive heuristic semantic ownership

Validation after Slice 30:
- targeted failure-mode tests
- targeted negative-path tests

------------------------------------------
SLICE 31 — GOVERNANCE AND APPROVAL LAYER
------------------------------------------

Goal:
Make approval, quarantine, promotion, and audit trails explicit so model-native capture is safe at scale.

Required result:
- governance layer is explicit and first-class
- model-native capture is safe for broader ingestion and later soak

Primary likely target surfaces:
- approval and quarantine seams
- governance metadata and routing
- audit trail surfaces for model-native capture and promotion

Spec requirement:
Write or expand the governance and approval layer spec.

Success bar:
- governance is explicit and testable
- approval/quarantine/promotion are not hidden in ad hoc runtime branches

Validation after Slice 31:
- targeted governance tests
- targeted review/approval flow tests

------------------------------------------
SLICE 32 — DB-NATIVE INGESTION CUTOVER
------------------------------------------

Goal:
Only after the above, switch bulk document ingestion into the DB on the model-native path.

Required result:
- DB submission for document ingestion uses the canonical model-native path
- the system is ready for real first-wave ingestion

Primary likely target surfaces:
- document-ingestion submission paths
- DB ingestion planning and execution
- any dry-run/submit split that still depends on old mixed-era architecture

Spec requirement:
Write or expand the DB-native ingestion cutover spec.

Success bar:
- bulk ingestion no longer depends on the old heuristic-era capture architecture
- DB ingestion uses the new canonical path

Validation after Slice 32:
- targeted DB-aware ingestion tests
- targeted dry-run/submit path tests

------------------------------------------
SLICE 33 — SOAK SUITE OVER GENUINE DB MEMORY
------------------------------------------

Goal:
Run soak only once capture, retrieval, pack compilation, and prompt assembly are all evaluated on real ingested canonical memory.

Required result:
- soak suite exists over genuine DB memory
- open questions are tested against the actual model-native memory stack

Primary likely target surfaces:
- soak harness
- retrieval/application proof tests
- any pack-compilation or prompt-assembly validation surfaces that must now run against real DB-backed memory

Spec requirement:
Write or expand the soak suite over genuine DB memory spec.

Success bar:
- soak conclusions are valid because they exercise the real captured memory system

Validation after Slice 33:
- targeted soak harness tests
- targeted retrieval/application proof tests

------------------------------------------
SLICE 34 — POST-CUTOVER CODE SLIMMING TRANCHE
------------------------------------------

Goal:
Delete obsolete resolvers, detector helpers, benchmark shims, transitional comparison scaffolding, and lane-local semantic residue.

Required result:
- obsolete heuristic-era code is removed
- transition scaffolding is deleted where no longer needed
- code volume drops materially

Primary likely target surfaces:
- obsolete resolver or detector modules
- benchmark shims
- transitional comparison helpers
- lane-local semantic residue exposed by the cutover

Spec requirement:
Write or expand the post-cutover code slimming spec.

Success bar:
- the codebase materially shrinks
- the remaining runtime accurately reflects a model-native architecture

Validation after Slice 34:
- targeted cleanup validation
- targeted runtime smoke tests
- `pnpm check:types` if justified

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
2. exact work completed in Slice 23
3. exact work completed in Slice 24
4. exact work completed in Slice 25
5. exact work completed in Slice 26
6. exact work completed in Slice 29
7. exact work completed in Slice 30
8. exact work completed in Slice 31
9. exact work completed in Slice 32
10. exact work completed in Slice 33
11. exact work completed in Slice 34
12. exact files changed/created/deleted
13. exact specs written/updated
14. exact roadmap/status/index/decision docs updated
15. exact architecture changes made
16. exact context-planner convergence changes landed
17. exact prompt-cache redesign changes landed
18. exact context-compaction redesign changes landed
19. exact outcome-proof redesign changes landed
20. exact cost/latency control-plane changes landed
21. exact failure-mode policy changes landed
22. exact governance/approval changes landed
23. exact DB-native ingestion cutover changes landed
24. exact genuine-DB-memory soak changes landed
25. exact post-cutover code-slimming changes landed
26. exact fast-lane tests run between slices
27. exact full final landing validation run at the end
28. exact validation results
29. exact commit(s) created
30. exact push result
31. final repo/worktree status
32. what remains deferred, if anything

Also include ELI5 sections:
- ELI5 — why memory, context, and prompt assembly had to converge into one planner
- ELI5 — why prompt cache ownership had to move to canonical artifacts
- ELI5 — why compaction had to be redesigned after semantic cutover
- ELI5 — why outcome proof had to become more causal and model-native
- ELI5 — why cost and latency controls matter for a model-native runtime
- ELI5 — why failure-mode policy had to be explicit
- ELI5 — why governance and approval had to become first-class
- ELI5 — why DB-native ingestion had to wait until after the earlier passes
- ELI5 — why soak had to run over genuine DB-backed memory
- ELI5 — why code slimming comes after cutover, not before
- ELI5 — why full test/build/landing waited until the end

Also include practical examples of:
- old memory side-bridge vs new context-planner ownership
- old prompt-fragment cache vs new canonical-artifact cache
- old compaction unit vs new canonical compaction unit
- one model-native outcome-proof example with rationale and application evidence
- one explicit failure-mode path that does not silently revive heuristic semantics
- one governance or quarantine example
- one DB-native ingestion example
- one soak assertion over genuine DB memory
- one example of code deleted in the post-cutover slimming tranche

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
If the system ends this pass with DB ingestion still materially dependent on old mixed-era capture architecture, or if soak still does not exercise genuine DB-backed canonical memory, or if code slimming fails to materially delete obsolete transition code, the correct result is not “close enough.” The correct result is that Pass 3 is not done.
```
