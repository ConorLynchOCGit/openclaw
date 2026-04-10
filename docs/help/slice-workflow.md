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

Use the concrete landing tiers in
[Landing Gate Tiers](/help/landing-gate-tiering-proposal) when you want the
repo's default feature, integration, or production bar.

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
- Run `pnpm check:fast` when it is cheap and useful for the touched surface.
- Add `pnpm check:types` only when the change touches runtime or typed code.
- Do not pay for broad sweeps, builds, or proof yet unless the change is hard
  to iterate without them.

This gate is for fast feedback, not landing confidence.

For most bounded slices, the next step up is the feature landing gate rather
than a full `pnpm test && pnpm build` sweep.

### Pre-proof gate

Run this once the code is stable enough for real proof.

- Run the strongest targeted tests for the touched surface.
- Add a broader owned-surface sweep only when the change crosses a shared
  boundary or the nearby tests are not enough.
- Run the smallest honest validation tier:
  - `pnpm check:fast` for docs/process-only and similarly narrow non-runtime
    work
  - `pnpm check:fast && pnpm check:types` or `pnpm check` for real runtime or
    typed-code changes
- For the standardized repo-wide tiers, use:
  - `pnpm gate:feature`
  - `pnpm gate:integration`
  - `pnpm gate:production`
- Run `pnpm build` only if the touched surface can affect build output,
  packaging, lazy-loading or module boundaries, or a published runtime.
- Treat `pnpm check:fast`, `pnpm check:types`, `pnpm check`, and `pnpm build`
  as serialized expensive gates on one checkout.

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

For non-production runtime proof on the VPS, prefer:

1. `pnpm build:runtime:fast`
2. `pnpm runtime:proof:fast`

Save the full image-oriented runtime path for production proof and promotion.

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
- rerun the previously required validation tier if code or typed script logic
  changed after proof
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
- Default validation tier: `pnpm check:fast`
- No `pnpm build` unless generated or build-sensitive artifacts changed
- Run only the smallest relevant validation plus `git diff --check`
- Helper paths that detect docs or changelog-only changes should follow the same
  rule: `pnpm check:fast`, no `pnpm build`, and no full-suite `pnpm test`

### Test only

- Run the touched tests
- Add `pnpm check:fast` by default
- Add `pnpm check:types` if typed helper or script surfaces changed
- No production proof unless the test change is paired with a real runtime fix

### Runtime change without production rollout

- Pre-proof gate is required
- Include `pnpm check:types`
- Isolated proof is recommended when the behavior is stateful or risky
- Production proof is not required if the slice is not claiming live rollout

### Live production behavior change

- Pre-proof gate is required
- Include full `pnpm check`
- Isolated proof is required
- Pre-production gate is required
- Production proof is required
- Post-proof docs and evidence belong in the same final commit

## What can run in parallel

After the code is stable enough for proof:

- nearby targeted tests can run in parallel with docs drafting
- `pnpm check:fast` and docs drafting can run in parallel
- proof-environment health checks can run in parallel with rollback-reference
  capture

Do not parallelize steps that hide causal order, such as proofing production
before the pre-proof gate is done.
Do not overlap expensive repo gates on the same checkout; the repo gate wrapper
now guards `pnpm check:fast`, `pnpm check:types`, `pnpm check`, and
`pnpm build` with a shared lock, and the same lock now covers the fast runtime
proof helper.
If you want to inspect running processes before a heavy gate, do that as a
separate step instead of combining process inspection and gate launch in one
parallel action.

Use `pnpm task:status` when you want the current checkout's lock holder and
active heavy-task PID before starting `pnpm test`, `pnpm check:*`, or
`pnpm build`.

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
   - `pnpm check:fast`
   - `pnpm check:types` if required for the change class
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

The closeout check is now partially enforced by helper paths:

- `scripts/committer` fails if the requested landing paths are still dirty
  after the commit it just created.
- repo push helper paths fail if the worktree is still dirty after landing or
  if local `HEAD` no longer matches the pushed upstream ref.
- The rule is still intentionally narrow:
  - commit-only flows verify the requested landing surface
  - push flows verify the full landing tree plus upstream sync

For Docker-backed proof or rollout:

- trust `/readyz` as the actual readiness gate
- treat `/healthz` as shallow liveness only
- where repo Docker surfaces expose container health, that health now tracks
  readiness rather than shallow liveness

## Validation tier reference

- `pnpm check:fast`
  - cheap repo hygiene and lint checks
  - default for docs/process-only work and most local iteration
- `pnpm check:types`
  - explicit type-check tier
  - currently runs `pnpm tsgo`
  - targetable local tiers also exist:
    - `pnpm check:types:core`
    - `pnpm check:types:plugin-sdk`
  - required for real runtime or typed-code changes
- `pnpm check`
  - full repo check
  - reuses a green `pnpm check:fast` result on the same unchanged tree, then
    runs `pnpm check:types`
  - normal full landing bar for real code changes
- `pnpm build`
  - serialized by the repo gate wrapper
  - prints timestamped phases, including `build:plugin-sdk:dts`

Current VPS caveat:

- `pnpm check:types` can still be the slowest or least stable tier on this
  host.
- That caveat justifies the tier split.
- It does not justify skipping the type tier for real code changes.

## Deferred after memory implementation

The remaining likely workflow and validation improvements are intentionally
deferred until after memory implementation is complete because they require more
serious work than the bounded workflow slices already landed.

- make `pnpm tsgo` itself faster or more reliable
- make hooks and commit tooling auto-select validation tiers from changed-file
  scope
- add partial or per-surface type checking instead of one repo-wide type pass
- change CI and local parity more aggressively
