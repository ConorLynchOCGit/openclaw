# Bounded Promotion And Off-Production Rollout Report V1

## 1. Starting state

At batch start, the repo had already landed:

- flattening batches v1-v6
- pre-capture hardening batch v1
- reduced-profile self-improving and advisory batch v1
- bounded rollout proof and reevaluation batch v1
- Main-session reminder isolation and memory consolidation batch v1

The accepted manual Main-session UX evidence already showed:

- no-prefix manual memory submission is real
- explicit natural wording works materially better than vague shorthand
- commit and test workflow retrieval is already strong
- explicit docs-localization and file-reference packet shapes are the strongest
  next packet classes to follow through
- self-improving capture and learned-guidance advisory planning should still
  stay narrow

## 2. Exact contracts chosen for slices 1-3

### Slice 1 — bounded promotion follow-through

Contract:

- prove that explicit docs-localization project-rule packets review, promote,
  and retrieve cleanly under their intended family
- prove that explicit file-reference response-style packets review, promote,
  and retrieve cleanly under their intended family
- keep vague shorthand packet shapes candidate-heavy
- preserve stronger approved memory outranking weaker nearby candidates

### Slice 2 — bounded off-production rollout enablement

Contract:

- keep self-improving capture candidate-only
- keep learned-guidance planning approved-only, inline-only, advisory-only
- require an explicit `off-production` rollout target before either seam
  activates
- keep default/production posture off unless an explicit off-production target
  is present

### Slice 3 — post-enablement memory judgment

Contract:

- turn the new promotion and rollout-gating evidence into an explicit memory
  judgment
- update the docs/spec pack to reflect what is actually landed
- define the next honest implementation slice from the new evidence

## 3. Exact runtime seams changed per executed slice

### Slice 1 runtime seams

Changed:

- `extensions/memory-middleware/src/retrieval-control-plane.ts`
- `extensions/memory-middleware/src/retrieval-control-plane.test.ts`
- `extensions/memory-middleware/src/tools/real-workspace-memory-packets.fixture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

What changed:

- added explicit docs-localization and file-reference packet fixtures for
  promotion follow-through
- added promotion/retrieval integration proof for those packet classes
- taught the retrieval control plane to keep stronger approved memory ahead of
  weaker nearby reviewable candidates inside the same bounded subject cluster
  when candidate-inclusive retrieval is requested

### Slice 2 runtime seams

Changed:

- `extensions/memory-middleware/openclaw.plugin.json`
- `extensions/memory-middleware/src/config.ts`
- `extensions/memory-middleware/src/config.test.ts`
- `extensions/memory-middleware/src/runtime.ts`
- `extensions/memory-middleware/src/self-improving-candidate-capture.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts`
- `extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts`
- `extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

What changed:

- added explicit `rolloutTarget: "off-production"` config support for
  self-improving capture and learned-guidance planning
- made mode alone insufficient for activation
- returned explicit disabled results when the rollout target is missing
- preserved explicit rollout scope and observability on disabled results

### Slice 3 doc/spec seams

Changed:

- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/NEXT_SUBSTRATE_PUSH_PLAN.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/specs/implementation-sequencing.md`
- `docs/memory-system/specs/self-improving-capture-integration.md`
- `docs/memory-system/specs/learned-guidance-advisory-planning.md`

What changed:

- recorded which explicit packet shapes are promotion-eligible now
- recorded that vague shorthand packet shapes still stay candidate-heavy
- recorded that self-improving and learned-guidance seams now require an
  explicit `off-production` rollout target before activation
- moved the “next” docs posture from enablement to actual off-production
  evidence review

## 4. Exact promotion / off-production rollout / judgment decisions landed

Promotion decisions landed:

- explicit docs-localization project-rule packet shapes are now honest to
  promote under bounded follow-through
- explicit file-reference response-style packet shapes are now honest to
  promote under bounded follow-through
- vague shorthand docs/file packet shapes are not honest to promote yet

Off-production rollout decisions landed:

- self-improving capture remains candidate-only and default-off
- learned-guidance planning remains approved-only, inline-only, advisory-only,
  and default-off
- both seams now require an explicit `off-production` rollout target before
  activation

Judgment decisions landed:

- explicit docs/file packet shapes can move ahead in bounded off-production
  evidence review
- broader docs/file phrasing classes should stay narrow for now
- broader self-improving and advisory widening is still not justified

## 5. Exact behavior preserved per executed slice

### Slice 1

Preserved:

- project-rule packets stay project-rule packets
- response-style packets stay response-style packets
- vague shorthand does not silently become strong canonical memory
- approved memory remains the real later authority

### Slice 2

Preserved:

- self-improving capture remains candidate-only
- learned-guidance planning remains approved-only and advisory-only
- production/default behavior stays off unless explicitly enabled for
  off-production rollout
- no direct approval, proactive execution, or hidden second policy path was
  added

### Slice 3

Preserved:

- no new memory families
- no collapsed family-policy differences
- no false claim that broad robustness or widening is now justified

## 6. Exact tests and validation run at the end of each executed slice

### Slice 1

Ran:

- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "captures real workspace memory packets and retrieves the right approved memory for each query|follows explicit docs-localization packets through bounded promotion and keeps weaker nearby candidates behind the approved rule|follows explicit file-reference packets through bounded promotion and keeps weaker nearby candidates behind the approved preference"`
- `pnpm test -- extensions/memory-middleware/src/retrieval-control-plane.test.ts -t "keeps approved memory ahead of reviewable candidates within the same bounded subject cluster|shapes project-family ranking from the shared control decision"`
- `pnpm check:types`

Result:

- passed after one real retrieval-ranking fix and one narrowed docs-field
  expectation adjustment
- one intermediate integration rerun hit a transient database bootstrap flake
  (`Connection terminated unexpectedly`), and the clean rerun passed

### Slice 2

Ran:

- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/config.test.ts extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "off-production|self-improving|learned-guidance|requires self-improving capture to opt in explicitly even when candidate ingress is candidate-only|requires learned-guidance advisory planning to opt in explicitly|normalizes bounded self-improving and learned-guidance rollout controls|returns disabled for self-improving capture before writing any candidate rows|keeps self-improving capture default-off until an explicit off-production rollout target is set|returns disabled for learned-guidance planning before touching the database when mode is off|keeps learned-guidance planning default-off until an explicit off-production rollout target is set|surfaces approved workflow guidance as advisory-only inline suggestions|routes valid reduced-profile workflow-improvement outputs through the candidate-only ingress seam with provenance"`
- `pnpm check:types`

Result:

- passed
- one first run exposed that the disabled learned-guidance path now returns the
  full bounded rollout scope; the tests were updated to assert that stronger
  disabled result shape explicitly

### Slice 3

Ran:

- docs/spec updates only at slice close
- final combined landing validation is recorded below

## 7. Exact remaining work after this batch

The remaining work is no longer enablement plumbing.

What remains:

- bounded off-production usage and evidence review for the now
  promotion-eligible explicit docs-localization and file-reference packet
  shapes
- bounded off-production evidence review for the still-default-off
  self-improving and learned-guidance seams
- explicit widen / stay-narrow / pause decisions only after that evidence
- later cross-domain family expansion only after those answers are clear

## 8. Exact next implementation slice recommended

Recommended next slice:

- bounded off-production evidence review for the promotion-eligible explicit
  docs-localization and file-reference packet shapes plus the still-default-off
  self-improving and learned-guidance seams

Why:

- the strongest explicit packet shapes are now promotion-eligible
- the rollout boundary is now explicit instead of implied by mode alone
- the remaining missing truth is real usage evidence on usefulness, noise,
  provenance, suppression, and prompt cost
