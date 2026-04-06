---
title: "Slice Landing Workflow"
summary: "Default repo workflow for validation, proof, commit, push, and closeout"
read_when:
  - Landing a bounded change slice
  - Deciding which gates to run before proof or push
  - Preparing production proof or closeout
---

# Slice Landing Workflow

This is the default workflow for bounded repo work.

Use it with [Testing](/help/testing) and the existing release policy in
[Release Policy](/reference/RELEASING).

The goal is to keep the right gates at the right time:

- fast local iteration while code is moving
- isolated proof before risky production changes
- narrow production proof only after enough confidence exists
- no repeated expensive gates unless a later code change invalidated them
- commit and push timing that match the actual proof and closeout flow

## Default phase order

1. Implementation loop
2. Pre-proof gate
3. Isolated proof, when required
4. Pre-production gate, when required
5. Production proof, when required
6. Finalize docs and closeout evidence
7. Pre-landing gate
8. Commit and push
9. Post-push verification

## Gate taxonomy

### Implementation loop gate

Use while code is still moving.

- Run nearby targeted tests only.
- Run `pnpm check` when it is cheap and useful for the touched surface.
- Do not pay for broad sweeps, builds, or proof yet unless the change is hard
  to iterate without them.

This gate is for fast feedback, not landing confidence.

### Pre-proof gate

Run this once the code is stable enough for real proof.

- Run the strongest targeted tests for the touched surface.
- Add a broader owned-surface sweep only when the change crosses a shared
  boundary or the nearby tests are not enough.
- Run `pnpm check`.
- Run `pnpm build` only if the touched surface can affect build output,
  packaging, lazy-loading or module boundaries, or a published runtime.

If no code changes happen after this gate, do not rerun these same expensive
checks later just for ceremony.

### Isolated-proof gate

Use an isolated non-production proof lane before production whenever the slice
changes runtime behavior, bounded writes, retrieval, ranking, scheduling,
prompt shaping, or other stateful/operator-visible behavior.

Isolated proof is optional for:

- docs-only changes
- pure test changes
- local-only tooling changes
- refactors that do not need behavioral proof

The isolated proof should be narrow and slice-shaped.

### Pre-production gate

Run this before any production deploy or proof.

- Freeze the proof plan.
- Capture the rollback reference.
- Capture pre-proof production health.
- Confirm the worktree still matches the code that cleared the pre-proof gate.
- If code changed after the pre-proof gate, rerun only the invalidated gates.

Do not deploy to production before this gate is green.

### Production-proof gate

Use a narrow production proof only when the slice changes live production
behavior or when the closeout claims something is live in production.

The proof should be:

- narrow
- cleanup-backed when it writes durable state
- rollback-backed
- explicit about exact turns, queries, ids, and health evidence

Production proof is not the place for discovery.

### Pre-landing gate

Run this after proof and after the final docs or closeout notes are in the
tree.

Always run:

- `git diff --check`

Also run any gate that was invalidated after proof. Typical examples:

- rerun targeted tests if code changed after proof
- rerun `pnpm check` if code or typed script logic changed after proof
- rerun `pnpm build` if build-sensitive code changed after proof

If the only post-proof edits were docs or proof notes, do not repeat the same
code-heavy test, lint, and build gates.

## Commit and push timing

Default timing:

- commit after required proof is complete and after final docs and evidence are
  in the tree
- push only after the commit exists and the pre-landing gate is still green

This keeps the commit aligned with the exact proofed behavior and final report.

Use `scripts/committer` for scoped commits.

Use `FAST_COMMIT=1` only when:

- equivalent gates already ran on the same tree, and
- the post-proof edits did not invalidate those gates

Otherwise let the normal hook path run.

Commit before proof only when the proof mechanism itself requires it or when
the proof will not change the committed artifact set.

Do not push before required production proof.

## Broad versus narrow tests

Prefer the smallest gate that can actually catch regressions in the touched
surface.

Use nearby targeted tests by default.

Escalate to a broader owned-surface sweep when:

- the change crosses a shared runtime boundary
- the change touches a historically failure-prone integration seam
- the touched surface has a maintained owned-surface baseline
- nearby tests are incomplete for the change you made

Escalate to the repo-wide landing bar when:

- pushing `main`, or
- the touched surface is broad enough that the default repo landing bar is the
  most honest gate

This workflow does not replace existing hard gates in `AGENTS.md`; it decides
when to pay them.

## Change class rules

### Docs or process only

- No isolated proof
- No production proof
- No `pnpm build` unless generated or build-sensitive artifacts changed
- Run only the smallest relevant validation plus `git diff --check`

### Test only

- Run the touched tests
- Add `pnpm check` if typed helper or script surfaces changed
- No production proof unless the test change is paired with a real runtime fix

### Runtime change without production rollout

- Pre-proof gate is required
- Isolated proof is recommended when the behavior is stateful or risky
- Production proof is not required if the slice is not claiming live rollout

### Live production behavior change

- Pre-proof gate is required
- Isolated proof is required
- Pre-production gate is required
- Production proof is required
- Post-proof docs and evidence belong in the same final commit

## What can run in parallel

After the code is stable enough for proof:

- nearby targeted tests can run in parallel with docs drafting
- `pnpm check` and `pnpm build` can run in parallel when the machine has the
  headroom and the two commands do not depend on each other
- proof-environment health checks can run in parallel with rollback-reference
  capture

Do not parallelize steps that hide causal order, such as proofing production
before the pre-proof gate is done.

## Capture evidence once

Closeout should capture these once, not repeatedly:

- exact validation commands run
- exact proof turns or queries
- exact ids or matched fields when the slice is evidence-driven
- rollback reference
- pre-proof and post-proof health
- final commit hash
- push result

If a proof report or closeout note already contains one of these, reference it
instead of re-collecting it.

## Suggested dry-run checklist

For a typical bounded production slice:

1. Iterate with nearby tests only.
2. Run pre-proof gate:
   - targeted tests
   - broader owned-surface sweep only if needed
   - `pnpm check`
   - `pnpm build` if required
3. Run isolated proof.
4. Capture rollback reference and pre-proof health.
5. Run narrow production proof.
6. Fill final docs and evidence.
7. Run `git diff --check` and only the gates invalidated after proof.
8. Commit with `scripts/committer`, optionally `FAST_COMMIT=1` if equivalent
   gates already ran on the same tree.
9. Push.
10. Verify upstream sync and clean worktree.

That is the default repo workflow unless a stricter surface rule overrides it.
