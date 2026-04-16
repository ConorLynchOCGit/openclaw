---
summary: "Deterministic identity, dedupe, and supersession policy."
title: "Identity, Dedupe, And Supersession"
---

# Identity, Dedupe, And Supersession

## Objective

Keep live writes deterministic and conservative while allowing bounded semantic
collision adjudication where exact identity is insufficient.

## Hard rule

V1 does not allow similarity search or thresholds to become merge authority in
the live write path.

That means:

- no embedding-only merge
- no similarity-threshold merge
- no “close enough” merge logic
- no rendered-text-first merge authority

V1 does allow:

- exact normalized identity dedupe
- bounded hybrid recall to find plausible prior objects
- a constrained model-owned adjudication step against that small candidate set
- deterministic policy that applies only the allowed adjudication outcomes

## Identity construction

Identity keys are built from normalized structured payload, not rendered statements.

Normalization may include:

- trim
- casefold
- whitespace collapse
- Unicode normalization
- stable URL canonicalization where applicable

## Kind-specific identity

### Preference

Key from:

- canonical class
- kind
- normalized scope
- normalized subject
- normalized instruction
- operation

### Fact

Key from:

- canonical class
- kind
- normalized scope
- normalized subject
- normalized value

### Rule

Key from:

- canonical class
- kind
- normalized scope
- normalized subject
- normalized recommended action
- normalized avoid action
- normalized needed capability

### Procedure

Key from:

- canonical class
- kind
- normalized scope
- normalized title
- normalized ordered steps

### Reference

Key from:

- canonical class
- kind
- normalized scope
- normalized task
- normalized primary resource
- normalized companion resources

## Dedupe policy

- exact normalized identity match -> dedupe
- no exact match -> run deterministic collision recall gating first, then
  batched collision adjudication only for the surviving ambiguous remainder
  before creating a new active object

## Deterministic collision recall gate

Collision recall must stay deterministic before any model-owned collision
adjudication runs.

The purpose of this gate is not to decide identity.

The purpose of this gate is to stop obviously unrelated prior objects from
reaching the adjudicator at all.

Hard rules:

- the gate must remain structural and deterministic
- the gate must not merge by similarity threshold alone
- the gate must not introduce a controlled vocabulary of tools, targets, or
  constraint classes
- weak token overlap by itself is not enough to make a prior object
  collision-plausible
- the gate may only pass candidates that survive explicit structural-anchor
  checks

Required preconditions before a prior object may enter the collision candidate
set:

- same canonical class
- same kind
- same normalized scope

Required anchor posture:

- exact identity is handled before this gate and does not enter collision
  adjudication
- same-slot supersession is handled deterministically before model adjudication
  when slot policy allows it
- unanchored overlap from generic instruction wording must not be treated as a
  plausible collision
- token overlap that comes only from broad policy language or generic coding
  language must not be enough to open a collision prompt

Examples:

- `GitHub issue/PR comment multiline bodies` must not be collision-routed
  against `Chat replies` just because both contain broad instruction wording
- `macOS app rebuild method` must not be collision-routed against unrelated
  `AGENTS.md` repo rules because they share generic operational tokens
- `gh issue/pr comment -b usage` may remain collision-plausible against
  `GitHub issue/PR comment multiline bodies` because they are in the same narrow
  operational area
- `Lazy loading boundary` may remain collision-plausible against
  `Lazy loading import strategy` because they are near the same runtime rule
  cluster

Additional v1 recall anchors are allowed only as candidate-generation aids:

- family-level recall must be derived from decisive-field text already present
  on the object
- family-level recall may use deterministic field-local fingerprints and
  decisive-field bundle fingerprints
- same-source neighborhoods may keep a plausible sibling alive when the bundle
  overlap is moderate and the same class/kind/scope guards still hold
- rule:
  - concatenated action-bearing fields may act as a strong recall anchor even
    when `recommendedAction`, `avoidAction`, and `neededCapability` are packed
    differently across otherwise same-claim rule restatements
- fact:
  - exact or near-exact same-value matches may remain recall-plausible even
    when one candidate is a broader wrapper around the narrower value claim
- procedure:
  - ordered step bundles may remain recall-plausible even when titles drift
- preference:
  - instruction plus operation bundles may remain recall-plausible even when
    subject phrasing drifts
- reference:
  - deferred from this sprint; task/resource family recall remains a later
    candidate, not a current write-path expansion

These anchors do not decide merge authority by themselves.

They only keep plausible same-claim candidates alive long enough for the
deterministic fast-attach lane or the bounded adjudication lane to judge them.

If no prior object survives the deterministic collision recall gate:

- do not call the collision adjudication model
- treat the object as `distinct` and continue with normal write policy

The gate is allowed to miss some attach-support opportunities.

That tradeoff is acceptable in v1 because the higher risk at this stage is
paying for noisy collision prompts and allowing weak, junky duplicate reasoning
to contaminate the write path.

This gate is intentionally biased toward:

- fewer collision prompts
- fewer false semantic matches
- less active-object junk

even if that means some memory loss at capture time.

See [Structural Family Recall](/projects/model-memory/specs/structural-family-recall)
for the anti-ontology family-recall design and kind-by-kind rollout posture.

## Deterministic fast-attach lane

Deterministic fast-attach remains a narrow optimization layer, not a second
merge authority.

Core-claim eligibility and packaging posture:

- core claim fields decide whether a retained candidate is eligible to be
  treated as the same durable claim
- packaging or framing fields must not block support attachment by themselves
  when core claim agreement is already strong and the remaining delta is only
  structural packaging drift
- subject/title wording is lower-authority by default, but it is not globally
  ignored:
  - it may still contribute to additive-delta detection
  - it may still matter when the normalized scope or structural delta says it
    is carrying real operational meaning

Current core claim fields:

- rule:
  - `recommendedAction`
  - `avoidAction`
  - `neededCapability`
- fact:
  - `value`
- procedure:
  - `steps`
- preference:
  - `instruction`
  - `operation`
- reference:
  - deferred from this sprint; current write-path expansion still does not
    widen reference support attachment

Current structural delta classes after class/kind/scope and core-claim
plausibility:

- `packaging_only_drift`
  - subject drift
  - title drift
  - field-packing drift
  - wrapper phrasing drift
  - reordered wording inside already-matching claim content
- `additive_operational_delta`
  - new exception
  - stronger constraint
  - new required capability
  - broader or narrower operational condition
  - new step
  - new resource
- `unresolved`
  - the remaining delta is not safely packaging-only, but it is also not
    cleanly classifiable as additive

Allowed fast-attach shapes:

- exactly one dominant retained candidate remains and all of these hold:
  - same canonical class
  - same kind
  - same normalized scope
  - exact or narrowly normalized core-claim agreement for the kind
  - the structural delta class is `packaging_only_drift`
  - no same-slot supersession reason
  - every other retained candidate fails that stronger core-claim agreement
    check

This current fast-attach expansion is intentionally narrower than earlier
active-versus-contained preference experiments.

If more than one retained candidate still has equal core-claim agreement, the
case remains ambiguous and must not fast-attach deterministically.

Kind-specific decisive payload agreement may include:

- fact:
  - exact or very high field-local normalized value agreement, even if subject
    phrasing drifts
- rule:
  - exact or very high field-local agreement on the populated
    action/capability fields, even if subject phrasing drifts
  - action-bearing field-packing drift may still count as the same rule when
    the combined action bundle remains a strong same-claim match
- procedure:
  - exact or very high field-local ordered step agreement, even if title
    wording drifts
- preference:
  - exact or very high field-local agreement on instruction plus operation,
    even if subject phrasing drifts
- reference:
  - exact or very high field-local agreement on task plus primary resource,
    with companion resources still aligned where present

Fast-attach is not allowed to:

- attach on broad textual similarity alone
- attach when multiple retained candidates remain genuinely ambiguous
- attach a narrower clause into a broader multi-part candidate just because one
  clause overlaps
- replace model adjudication for multi-target ambiguity

## Structural batch evidence

When deterministic fast-attach does not fire, the bounded adjudication lane
must receive explicit structural evidence rather than reconstructing sameness
from raw payload blobs.

Required evidence now includes:

- dominant candidate id when one exists but is not deterministic-safe
- core-claim match summary
- blocking-field summary
- structural delta class
- packaging drift type
- explicit same-claim leaning flag

The batch lane owns only:

- unresolved wrapper-vs-constraint cases
- broader-vs-narrower rule variants
- supersede-vs-support ambiguity
- multi-candidate same-family ambiguity

It must not:

- choose between two competing active same-claim candidates
- attach into a contained candidate when an active same-claim candidate does
  not exist
- bypass ambiguity simply because several retained candidates look similar

Field-local wording drift is allowed only inside the decisive payload fields
themselves.

When decisive fields already agree, a narrow structural non-additive-delta
check is allowed before calling the rerun `distinct`.

Allowed non-additive delta examples:

- subject drift
- title drift
- wrapper phrasing
- reordered phrasing inside the same decisive field

Those deltas may count as same-claim-leaning evidence.

They do not authorize attaching when the remaining delta adds:

- a new requirement
- a new exception
- a new capability
- a new step
- a new resource

It does not authorize:

- broad whole-object similarity as merge authority
- attaching a broader candidate just because one clause contains the narrower
  rule or fact text
- collapsing unrelated rule constraints into one object because the overall
  subject area overlaps
- using broader wrapper candidates as merge authority when a narrower same-value
  fact candidate is the only decisive-field match

## Collision adjudication policy

Hybrid recall is candidate generation only.

It may use:

- normalized search text
- payload renderings for retrieval only
- canonical class filters
- kind filters
- compatible scope filters

It must not directly decide merge.

Allowed adjudication outcomes are:

- `attach_support`
- `supersedes`
- `distinct`
- `conflict_hold`

Policy rules:

- `attach_support` -> attach the new support item to the existing memory object
  instead of creating a second active object
- `supersedes` -> create a replacement object and explicit supersession link
- `distinct` -> create a separate memory object
- `conflict_hold` -> keep the candidate out of the active runtime set until a
  later automated resolution step clears it

The adjudicator must not:

- invent a third semantic object
- merge solely because text is similar
- use the first observed wording as durable identity

## Batched residual collision adjudication

After deterministic identity checks, same-slot deterministic checks, and the
deterministic collision recall gate, any unresolved remainder should be
adjudicated in batch rather than one prompt per object.

Default batching unit:

- one source write batch after canonicalization completes

Permitted fallback batching unit when prompt budget requires splitting:

- deterministic chunks ordered by source window id and candidate identity key

Batching rules:

- if the unresolved remainder is empty, do not call the collision adjudicator
- if the unresolved remainder is non-empty, prefer one model call for the whole
  remainder batch
- only split into multiple calls when input or output budget requires it
- chunking must be deterministic and inspectable

Each batched adjudication request must include, for every unresolved new
object:

- a stable local candidate id
- the canonical object
- a bounded candidate set of prior objects that survived deterministic gating
- only the minimal object-native fields needed for safe adjudication

Each batched adjudication response must return one decision per unresolved new
object:

- `attach_support`
- `supersedes`
- `distinct`
- `conflict_hold`

For `attach_support` and `supersedes`, the response must include exactly one
target object id.

The batched adjudicator must not:

- invent new targets
- create relations between unresolved new objects that were not provided as
  explicit prior candidates
- use one unresolved object as semantic authority for another unresolved object
- return multiple competing targets for one candidate

## Current calibration posture

Residual batched collision adjudication is considered good enough for the
current proof phase.

That means:

- it is now acceptable to proceed into wider ingestion and broader proof with
  the current deterministic-first plus batched-remainder write path
- residual attach-support misses remain a follow-up calibration topic, not a
  current blocker
- revisit prompt calibration later only if broader corpus runs show recurring
  close-case under-attachment, noisy `distinct` growth, or repeated
  `conflict_hold` accumulation on genuinely same-claim objects

This does not lower the semantic contract.

It only records the current sequencing decision: broader ingestion proof now
takes priority over further local optimization of the tiny ambiguous remainder.

Deterministic post-processing rules:

- validate every returned row against the submitted candidate ids and target ids
- discard malformed or partial rows
- treat missing, malformed, or invalid rows conservatively

Conservative failure policy:

- do not auto-upgrade unresolved remainder objects into active `distinct`
  writes just because the batched prompt returned weak or incomplete output
- when the batched output is invalid or still ambiguous, prefer non-active
  containment over junky active writes
- default that containment to `conflict_hold` unless a later explicit policy
  chooses stricter omission

This batch lane is optimized for reducing collision-call count and active-set
pollution, not for maximizing raw capture count.

Memory loss is acceptable here when the alternative would be:

- paying many noisy model calls
- creating weak duplicate objects
- introducing more junk into the durable store

## Support attachment policy

Durable memory identity belongs to the canonical object, not to one captured
phrasing.

Multiple source windows may attach support to one memory object when the
adjudicator determines they represent the same durable memory.

Support attachment must record whether the new support counts as independent
reinforcement.

Same-source reruns must not count as independent reinforcement.

Derived daily continuity recovery sources must not count as independent
reinforcement for a memory already captured from a primary source.

## Supersession policy

V1 allows same-slot supersession for clearly single-valued memories.

Examples:

- a fact for one subject in one scope
- a stable preference for one subject in one scope

Rules:

- same slot, same value -> dedupe
- same slot, different value -> supersede old with new
- different slot -> keep separate

If supersession is proposed by collision adjudication, deterministic policy must
still verify that the target behaves like a single-valued slot before
activating the replacement.

## Lifecycle policy

Memory objects may carry lifecycle states such as:

- `provisional`
- `active`
- `superseded`
- `expired`
- `conflict_hold`

Rules:

- primary accepted captures may activate immediately when write policy allows
- finalized daily continuity recovery creates provisional candidates only
- provisional objects do not enter active runtime read models by default
- provisional objects may be promoted only by allowed reinforcement policy
- derived-source rediscovery alone must not promote a provisional object
- stale provisional objects may expire if they fail to gain valid reinforcement

## Deferred work

Broader clustering, large-scale consolidation, and experimental provisional
recall scoring remain deferred beyond the default v1 runtime.
