---
summary: "Family-level deterministic recall derived from decisive fields, not ontology labels."
title: "Structural Family Recall"
---

# Structural Family Recall

## Objective

Improve same-claim prior-object recall before object-level choice without
recreating the old semantic forest.

This spec defines a narrow family-level recall layer that:

- is deterministic
- is derived from decisive-field text already stored on the object
- stays local to the same canonical class, kind, and normalized scope
- may use same-source neighborhoods as a recall aid
- does not become merge authority by itself

## The anti-pattern

The system must not introduce a predefined semantic catalog such as:

- tool enums
- operation-target enums
- constraint-class enums
- semantic routers that route or merge based on those invented labels

Why that is wrong:

- it does not scale
- it biases the system toward hand-authored meaning instead of object-native
  meaning
- it recreates the old semantic forest where local labels quietly become truth
- it encourages merge decisions based on interpreted buckets instead of the
  stored decisive fields

## The right abstraction

The recall substrate comes from the object itself:

- normalized decisive-field content
- deterministic field-local token fingerprints over that content
- deterministic bundle fingerprints across the decisive fields for that kind
- source-local recall neighborhoods when the current rerun comes from the same
  source family
- structural delta comparison after recall

That means the system says:

- these two rule payloads share a strong normalized action bundle
- these two fact payloads share the same value bundle with wrapper drift
- these two procedures share the same ordered step bundle

It does not say:

- this is a `git` rule
- this is a `release naming` rule
- this belongs to a predefined constraint class

## Two-stage model

### Stage 1: permissive structural recall

Hard guards remain:

- same canonical class
- same kind
- same normalized scope

Within that neighborhood, candidates may stay alive for choice if:

- decisive fields already match strongly
- decisive-field bundle fingerprints overlap strongly
- or the same source family plus moderate decisive-field bundle overlap says
  the candidate is a plausible sibling

Stage 1 is recall only.

It does not attach support, supersede, or merge anything.

### Stage 2: precise structural choice

After recall:

- deterministic attach may fire only for narrow safe shapes
- batch adjudication owns the ambiguous remainder
- `distinct` still wins when the delta adds a real new requirement, exception,
  capability, step, or resource

Merge authority remains separate from recall:

- recall may widen
- merge authority stays deterministic-only for narrow safe shapes
- ambiguity stays model-owned or contained

## Kind-by-kind plan

### Rule

Decision: `yes_now`

Reasoning:

- the dominant remaining misses are dense rule-family restatements
- decisive fields already exist:
  - `recommendedAction`
  - `avoidAction`
  - `neededCapability`
- rules benefit from field-local fingerprints and combined action-bundle
  fingerprints
- subject text is secondary only

### Fact

Decision: `yes_now`

Reasoning:

- fact misses often involve the same value with wrapper or broader/narrower
  phrasing drift
- decisive-field text is the normalized `value`
- structural family recall can keep same-value candidates alive without turning
  wrapper similarity into merge authority

### Procedure

Decision: `yes_now`

Reasoning:

- procedures already have strong decisive structure in ordered `steps`
- title drift is common and should not kill recall when the ordered step bundle
  is still the same

### Preference

Decision: `yes_now`

Reasoning:

- preferences have narrow decisive fields:
  - `instruction`
  - `operation`
- subject drift is common
- field-local fingerprints over instruction plus operation are structurally
  safe enough to use as recall aids now

### Reference

Decision: `yes_later`

Reasoning:

- references are more sensitive to task/resource phrasing drift and retrieval
  intent
- the decisive fields are structurally useful, but the current evidence does
  not show reference-family recall as the top leverage fix
- reference recall can follow later once rule/fact/procedure/preference
  behavior is revalidated

## Same-source neighborhoods

Same-source neighborhoods are allowed only as a recall aid.

They are safer than broad semantic routing because they stay inside a narrow
local neighborhood:

- same canonical class
- same kind
- same normalized scope
- same source family

Same-source neighborhoods may keep a plausible sibling alive when decisive-field
bundle overlap is moderate but not yet strong enough to survive globally.

They are not merge authority.

## Scalability and safety

This scales better than a catalog because:

- fingerprints come from stored text already present on the object
- no human-maintained tool or target taxonomy is required
- the search neighborhood stays narrow
- deterministic attach still requires decisive-field agreement plus structural
  non-additive delta

## Non-goals

This spec does not allow:

- ontology expansion
- semantic routing
- broad global similarity merge
- reduced candidate generation
- keyword authority
- rendered-text-first duplicate truth

## Related specs

- [Identity, Dedupe, And Supersession](/projects/model-memory/specs/identity-dedupe-supersession)
- [Proof And Benchmark](/projects/model-memory/specs/proof-benchmark)
