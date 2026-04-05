# Architecture Fit Review

## Verdict

The current spec pack is coherent enough for implementation sprinting, with one
important rule:

- implementation must preserve the separation between:
  - semantic detection
  - bounded canonicalization
  - behavior application
  - deterministic phrase induction

If those layers collapse into one mixed heuristic path, the design will drift
back toward a brittle and hard-to-audit system.

## Cross-spec ownership map

### Semantic detector owns

- event-family detection
- evidence extraction
- confidence assignment

### Ambiguity policy owns

- accept vs candidate-only vs clarify vs ignore

### Candidate confirmation lifecycle owns

- what happens after `candidate_only`
- confirming evidence rules
- contradiction rules
- expiration rules
- promotion eligibility after confirmation
- the no-dead-candidate rule across candidate-producing families

### Canonicalization owns

- mapping supported events into bounded subject/value forms
- shared use of a code-owned typed canonical subject registry inside
  `memory-middleware`

### Behavior application owns

- later-turn precedence and active profile composition
- ephemeral per-turn `ActiveBehaviorProfile` materialization only

### Phrase induction owns

- reviewed expansion of deterministic trigger coverage
- candidate-only phrase proposals and reviewed promotion into a DB-backed
  approved pattern store

### User repair/control owns

- correction, supersede, forget, and do-not-remember flows from the user side
- conversational targeting rules for repair without a full inspection UI

## Conflicts checked

- detector vs canonicalizer:
  - separated correctly in the specs
- ambiguity policy vs candidate confirmation lifecycle:
  - ambiguity chooses the outcome; lifecycle governs only the follow-on path
    after `candidate_only`
- behavior application vs retrieval ranking:
  - ranking remains upstream retrieval logic; application remains turn-time
    selection and precedence
- behavior application vs recurring procedure memory:
  - procedure memory defines what procedure artifacts exist; behavior
    application defines when they are suggested, directly used, or omitted
- user repair vs correction capture:
  - repair expands and formalizes the control loop rather than replacing
    correction capture
- user repair vs behavior application:
  - behavior application exposes enough applied-memory context for repair
    targeting, but it does not become a user-facing memory browser in v1
- phrase induction vs semantic detector:
  - phrase induction is downstream and reviewable; it is not a second detector

## Hidden infra risks checked

The spec pack does not require a new standalone memory service.

It stays inside:

- `memory-middleware`
- existing DB-backed candidate/review/promotion model
- a code-owned canonical subject registry plus DB-backed approved phrase
  patterns
- existing retrieval surfaces
- existing proof-vs-production posture

## Main remaining architecture risk

The main risk is not missing infra. It is overcoupling:

- detector
- parser
- canonicalizer
- candidate confirmation lifecycle
- behavior application

must remain separate in code and tests.

## Corrections applied during review

- behavior application was promoted to a first-class architecture layer
- ambiguity policy was separated from detector behavior
- detector outputs were fixed to candidate metadata and observability rather
  than a new durable artifact type
- approved induced phrase patterns were fixed to a reviewed DB-backed store
  merged with code-owned built-in patterns
- productionization of off-production governance surfaces was given its own
  planning track instead of being left implicit
- messy-language eval was made an explicit gate rather than a vague future idea

## Remaining caution

The roadmap is now fit for execution, but only if future slices continue to:

- update the inventory
- update the relevant spec docs
- avoid treating fallback duplicate suppression as a substitute for a real
  product loop
- avoid reintroducing candidate families that depend on indefinite manual
  backlog instead of auto-confirm, prompt-now, or expiration
