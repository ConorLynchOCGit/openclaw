# Current Slice

## Active slice

Bounded promotion follow-through and off-production rollout enablement for
the stronger explicit memory packet shapes proved in Main-session UX testing

## Objective

Use the newly landed reminder-isolation and overlap-consolidation work to
promote the strongest explicit packet shapes honestly, then collect
off-production evidence before any widening decision.

The current accepted answer is:

- both seams now have real rollout controls and structured observability
- both seams should stay narrow for now
- neither seam has earned broader authority or broader family coverage yet
- Main session no longer needs to leak internal reminder payloads into visible
  chat to support internal reminder execution
- explicit docs-localization rules and file-reference response-style packets
  now have stronger canonical lanes than they had before the manual UX pass
- the next missing truth is bounded promotion follow-through plus off-production
  evidence, not more shared-substrate design

This slice does not answer production enablement by default.

It answers:

- which explicit packet shapes are now strong enough for bounded promotion
  follow-through
- whether bounded off-production usage shows enough usefulness, low-enough
  noise, and low-enough prompt cost to justify later widening

The rollout still must avoid creating:

- a second memory authority
- silent policy mutation
- broader capture spray across families

## What just landed

### Slice 1 — Main-session reminder isolation

- internal-only cron / exec reminder execution no longer reuses the visible
  Main chat transcript path
- those reminder turns now isolate onto the heartbeat session instead of
  surfacing the system payload in Main
- ordinary user prompts and ordinary assistant replies remain visible in Main

### Slice 2 — docs and formatting memory consolidation

- explicit docs-localization policy phrasing now has a bounded project-rule
  semantic path when it includes clear project scope
- docs i18n / translation / `docs/zh-CN` rule queries now route more cleanly
  toward project-rule retrieval instead of falling back toward generic project
  facts
- file-reference response-style guidance now has a bounded generalized subject:
  `file references`
- file-reference retrieval now gets a subject-level ranking hint instead of
  relying only on loose text overlap

### Slice 3 — bounded rollout follow-through judgment

- explicit natural memory packet shapes are now strong enough to continue with
  bounded promotion follow-through
- vague shorthand packet shapes still have not earned broader normalization or
  broader promotion
- self-improving capture and learned-guidance advisory planning still stay
  narrow; this batch did not change that widening judgment

## What is now strong enough for bounded promotion follow-through

- explicit docs-localization operating rules with clear project scope
- explicit file-reference response-style guidance
- already-strong commit / test workflow lessons

These are strong enough for bounded promotion follow-through, not automatic
widening.

## What remains intentionally narrow

- vague shorthand workflow memories
- vague shorthand docs-localization memories
- vague shorthand file-formatting memories
- broader self-improving family coverage
- broader learned-guidance advisory coverage

## What remains intentionally disabled

Still intentionally disabled:

- direct approval from self-improving outputs
- direct phrase-pattern approval from self-improving outputs
- direct procedure validation from self-improving outputs
- broader self-improving family spray
- background-job learned-guidance planning
- advisory planning that writes memory or executes actions

## What is now live but still bounded

- reduced-profile self-improving capture exists as a default-off,
  workflow-guidance-only, candidate-only seam
- learned-guidance advisory planning exists as a default-off, approved-only,
  inline-only workflow-guidance seam
- both seams now expose explicit rollout scope and structured evaluation /
  observability fields in their runtime results
- Main-session internal reminders now execute without leaking their system
  payloads into visible Main chat
- explicit docs/file packet shapes now have tighter semantic and retrieval
  control-plane support

Live rollout controls now include:

- explicit allowed lesson-family scope for self-improving capture
- explicit allowed lesson-family scope for learned-guidance advisory planning
- explicit default suggestion-budget control for inline advisory planning

Live rollout signals now include:

- self-improving outcome codes for created, blocked, replay-blocked, disabled,
  and failed decisions
- self-improving review-burden and duplicate-outcome signals
- advisory outcome codes for surfaced, suppressed, disabled, and no-guidance
  decisions
- advisory record counts, filtered-by-scope counts, and estimated prompt cost

These are live substrate capabilities, not production-wide enablement.

## What is not next

Still not next:

- new memory families by default
- broad self-improving family expansion
- advisory planning that bypasses approved retrieval
- autonomy or scheduler-driven execution from learned guidance

## What must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## The next main implementation sequence

The next main implementation sequence should now be:

1. bounded promotion follow-through for the strongest explicit docs-localization
   and file-reference packet shapes
2. bounded off-production enablement using the now-cleaner Main-session and the
   already-landed rollout controls / observability
3. collect real evidence on usefulness, replay noise, conflict suppression,
   and prompt cost
4. only then decide whether any broader phrasing class, self-improving scope,
   or advisory scope should widen
5. cross-domain family expansion only after those rollout answers are clear

Reason:

- the Main-session leak is fixed structurally
- the strongest manual-UX-backed docs/file packet shapes now have cleaner
  canonical lanes
- the remaining missing truth is still evidence under bounded rollout, not
  missing architecture
- widening vague packet classes before evidence exists would risk promoting the
  wrong memories for the wrong reasons
