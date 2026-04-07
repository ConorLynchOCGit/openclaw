# Memory System Roadmap

## Goal

Finish the OpenClaw memory build as a bounded, reviewable, operator-safe
system that:

- survives long-running work cheaply
- captures durable user and project knowledge reliably
- handles messy real-world phrasing without depending on exact wording
- keeps durable storage structured, explainable, and reversible
- does not broaden into uncontrolled automation

This roadmap replaces the older scaffold-first roadmap. The early foundation
phases are already complete enough to support live bounded memory work. The
remaining roadmap is about finishing the product and operational shape.

Roadmap pivot note:

- the bounded lesson-key slices were necessary scaffolding
- the program is no longer primarily advancing by enumerating one lesson key
  at a time
- the next scaling path is broader supervised lesson learning with explicit
  review rather than more hand-authored lesson registries

## Current compact checkpoint

Use this section first when returning to the memory build after working on
other projects.

Current state:

- the schema, plugin shell, DB layer, candidate ingress, review, promotion,
  retrieval, and bounded scheduler surfaces already exist
- the first bounded production soak is complete and passed for its intended
  scope
- ordinary live interaction -> bounded candidate capture is proven
- fresh-session corrected retrieval is proven for bounded preference,
  response-style, and named project-fact cases
- the current accepted canonical seam remains `model_tool_primary`
- `transcript_subscriber_fallback` is a proven bounded assist path and
  duplicate-suppression seam, not the canonical seam
- bounded response-style auto-promotion is live for the currently approved
  low-risk requirements
- the quick-win governance tranche is now production-proven as internal manual
  workflow coverage for:
  - validated-procedure retrieval when explicitly requested
  - candidate procedure promotion
  - procedure validation
  - skill-candidate planning and creation
  - procurement planning plus internal procurement-record creation
- the first bounded semantic response-style UX slice is now live for its
  intended scope:
  - semantic response-style detection is live for:
    - plain English / avoid jargon
    - bullet points
    - concise replies
    - numbered steps when giving instructions
    - no tables unless asked
  - medium-confidence response-style signals can now enter a
    candidate-with-confirmation lifecycle instead of dead manual backlog
  - later confirming evidence can auto-promote a bounded response-style
    candidate without manual review
  - bounded conversational forget is live for targetable supported
    response-style subjects
  - a checked-in messy-language eval harness now exists for the supported
    response-style family
- the first bounded semantic project-memory UX slice is now live for its
  intended scope:
  - semantic explicit named-project detection is now live for:
    - default branch
    - staging branch
    - primary package manager
    - primary environment name
  - medium-confidence project-fact signals can now enter a
    candidate-with-confirmation lifecycle instead of dead manual backlog
  - later confirming evidence can auto-promote a bounded project-fact
    candidate without manual review
  - bounded project-fact correction or supersede is now live for supported
    subjects
  - approved-only hybrid retrieval now ranks the right project fact more
    cleanly for direct fresh-session project questions
- the next bounded project-memory slice is now live for its intended scope:
  - semantic explicit named-project detection is now also live for:
    - repository URL
    - deployment URL
  - later confirming evidence can auto-promote those URL facts without manual
    review
  - approved-only hybrid retrieval now ranks the right URL field for direct
    fresh-session project questions
  - project-fact lifecycle inspection and duplicate suppression are now
    project-scoped for supported fields
  - unsupported generic deterministic labels like plain `repo` and `deploy`
    stay outside the bounded project-fact family
- the third bounded project-memory slice is now live for its intended scope:
  - semantic explicit named-project detection is now also live for:
    - documentation URL
    - runbook URL
  - later confirming evidence can auto-promote those support URL facts without
    manual review
  - approved-only hybrid retrieval now ranks the right support URL field for
    direct fresh-session project questions
  - unsupported generic deterministic labels like plain `docs` stay outside
    the bounded project-fact family
- Slice 7 is now landed for its intended scope:
  - `I meant plain English, not jargon.` can land as a bounded correction
  - `No, use bullet points for me.` can be accepted through bounded fallback
    capture while the drifting model-side `learning` submit is
    duplicate-suppressed
  - overlapping approved response-style memories now rank more cleanly for
    direct fresh-session questions
  - wider bounded named project-fact coverage is now proven for
    `default branch` and `primary package manager`
- the first recurring-procedure behavior expansion is now live for its
  intended scope:
  - nearby deploy/release/triage/investigation asks can now retrieve the right
    stored validated checklist without explicit `checklist` wording
  - prompt guidance now makes suggestion-first behavior explicit for nearby
    advice asks
  - direct-use remains limited to clear checklist asks
- the first workflow-improvement slice is now live for its intended scope:
  - semantic tool-gotcha detection is now live for:
    - using `pnpm test -- <path-or-filter>` instead of raw Vitest
    - using `scripts/committer "<msg>" <file...>` instead of manual
      `git add` + `git commit`
    - avoiding `git stash` in this multi-agent repo
    - recognizing bounded environment constraints for:
      - `python_command_unavailable`
      - `gateway_tools_invoke_forbidden`
  - first-seen supported workflow lessons now enter a
    candidate-with-confirmation lifecycle instead of dead manual backlog
  - later confirming evidence can auto-promote a bounded workflow lesson
    without manual review
  - approved-only hybrid retrieval can now surface the right workflow lesson
    as bounded guidance for later repo-operating asks
  - prompt guidance now makes the guidance-only posture explicit for running
    tests, making scoped commits, git-state safety asks, and known environment
    constraint asks
- the next bounded workflow-improvement slice is now live for its intended
  scope:
  - semantic API workaround detection is now live for:
    - `openai_embeddings_api_key_required`
    - `anthropic_context1m_eligible_credential_required`
  - first-seen supported API workaround lessons now enter a
    candidate-with-confirmation lifecycle instead of dead manual backlog
  - later confirming evidence can auto-promote a bounded API workaround lesson
    without manual review
  - approved-only hybrid retrieval can now surface the right API workaround as
    bounded guidance for later provider-troubleshooting asks
  - prompt guidance now explicitly covers OpenAI embeddings auth and Anthropic
    long-context eligibility questions
  - semantic retrieval for approved API workaround guidance is now live only
    for the supported approved lesson keys
- the first bounded semantic retrieval routing slice is now live:
  - `memory_object_search_hybrid` remains the default working-context
    retrieval path
  - nearby recurring-procedure asks can now use procedure-only semantic
    fallback when:
    - `scope = include_validated_procedures`
    - `kind = procedure`
    - hybrid does not already have a strong typed validated-procedure match
  - validated procedure source memory objects can now receive bounded
    semantic embeddings during validation or equivalent validated promotion
  - exact checklist asks still stay hybrid-first
  - candidate semantic retrieval is still disabled
- the second bounded semantic retrieval routing slice is now live:
  - approved environment-constraint guidance can now use project-scoped
    semantic fallback when:
    - `scope = approved_only`
    - `kind = project`
    - hybrid does not already have a strong typed environment-constraint match
  - approved environment-constraint source memory objects can now receive
    bounded semantic embeddings during approved promotion or backfill
  - exact environment-constraint asks still stay hybrid-first
- the third bounded semantic retrieval routing slice is now live:
  - approved workflow-improvement tool-gotcha guidance can now use
    project-scoped semantic fallback when:
    - `scope = approved_only`
    - `kind = project`
    - hybrid does not already have a strong typed project match
  - only the supported approved tool-gotcha lesson keys are eligible:
    - `vitest_wrapper_required`
    - `scripts_committer_required`
  - approved workflow tool-gotcha source memory objects can now receive
    bounded semantic embeddings during approved promotion or backfill
  - exact tool-gotcha asks still stay hybrid-first
- the fourth bounded semantic retrieval routing slice is now live:
  - approved API workaround guidance can now use project-scoped semantic
    fallback when:
    - `scope = approved_only`
    - `kind = project`
    - hybrid does not already have a strong typed project match
  - only the supported approved API workaround lesson keys are eligible:
    - `openai_embeddings_api_key_required`
    - `anthropic_context1m_eligible_credential_required`
  - approved API workaround source memory objects can now receive bounded
    semantic embeddings during approved promotion or backfill
  - exact API workaround asks still stay hybrid-first
- the fifth bounded semantic retrieval routing slice is now live:
  - approved `git_stash_unsafe` workflow guidance can now use project-scoped
    semantic fallback when:
    - `scope = approved_only`
    - `kind = project`
    - hybrid does not already have a strong typed project match
  - approved `git_stash_unsafe` source memory objects can now receive bounded
    semantic embeddings during approved promotion or backfill
  - strong typed stash-safety project matches still stay hybrid-first when
    they exist

Current live limits:

- the front end is improved for the bounded response-style and named-project
  families, but still too brittle outside those families because deterministic
  matching is doing too much of the first-pass interpretation work
- broader semantic learning-event detection is not live yet
- family-aware semantic retrieval routing is now live only for nearby
  recurring-procedure asks under explicit validated-procedure scope and
  approved environment-constraint guidance plus the supported approved
  workflow tool gotchas (`vitest_wrapper_required`,
  `scripts_committer_required`, `git_stash_unsafe`) and supported approved
  API workaround guidance under approved-only project scope
- phrase induction from fuzzy detections into reviewed deterministic patterns
  is not live yet
- broader structured procedures are not live as a normal remembered user
  feature yet
- recurring procedures are still bounded to the supported named checklist
  family and do not silently apply in the background
- workflow-improvement memory is now live for:
  - the first bounded repeated tool-gotcha, workflow-simplification, and
    environment-constraint families
  - the first broader reviewed repo-local workflow-guidance path
- repeated API failure workaround memory is now live only for the first bounded
  approved guidance family
- broader project memory is still limited to explicit named-project facts for:
  - default branch
  - staging branch
  - primary package manager
  - primary environment name
  - repository URL
  - deployment URL
  - documentation URL
  - runbook URL
    and does not include speculative state
- broader workflow-improvement memory is no longer limited to supported lesson
  keys only:
  - reviewed generic repo-local workflow guidance is now live
  - and it remains guidance-only, bounded auto-review, and hybrid-first
- recommendation-only procurement/install artifacts are not live yet
- self-improving capture remains disabled in production
- automatic Skill Vetter invocation remains disabled
- procurement/install automation remains disabled
- actual installation remains disabled
- memory-slot takeover remains disabled

Built and validated off-production, but not yet fully brought online as normal
production behavior:

- manual Skill Vetter handoff preparation plus manual vetting-result recording
- approval planning plus internal approval-state recording
- manual install handoff plus internal install-record creation

Important distinction:

- some of these surfaces are already present in the configured production
  posture as bounded internal governance tools
- but they have not yet been treated as normal production-proven operator
  workflows or user-facing remembered behavior
- the roadmap must explicitly bring them online rather than leaving them as
  “validated somewhere else once”

Production safety posture:

- production Control UI protection is currently host-level Tailscale Serve,
  not OpenClaw built-in `gateway.tailscale`
- production pairing/auth is no longer an acceptable proof surface for memory
  development
- Slice work must use the isolated proof environment first
- production acceptance should be narrow, late, and rollback-backed

Delivery enablement pause:

- semantic retrieval v5 proved that the current memory roadmap is now being
  slowed down more by proof and rollout friction than by missing feature
  design
- a short pre-feature delivery enablement tranche is now part of the roadmap
  before the next user-facing memory family resumes
- scope:
  - shared memory runtime bootstrap helper
  - repo-owned memory proof runner
  - enforced clean-tree landing assertion
  - Docker health/readiness alignment
- landed so far in this pause:
  - shared memory runtime bootstrap helper
  - repo-owned memory proof runner v1
  - enforced clean-tree landing assertion
  - Docker health/readiness alignment
- the delivery enablement pause is now complete and the first resumed
  user-facing bounded project-memory v3 slice is also now landed
- the next resumed user-facing workflow-improvement v2 slice is now also
  landed for:
  - `docs_only_check_fast`
  - `memory_proof_runner_required`
  - `readyz_for_readiness`
- the first generalized supervised lesson learning pivot slice is now also
  landed:
  - broader repo-local workflow guidance can now be captured without
    per-lesson key registration
  - broader workflow guidance now normalizes into reviewed generic lesson
    shapes instead of expanding the lesson-key registry again
  - approved retrieval for those generic lessons currently stays hybrid-first
    and guidance-only
- generalized lesson auto-review and promotion is now also landed:
  - broader generic workflow lessons now enter `hold_for_more_evidence`
    instead of indefinite manual review
  - two compatible evidence events can auto-promote an approved lesson without
    a pre-registered lesson key
  - stale held clusters now reject cleanly instead of lingering
  - stronger newer conflicting clusters can supersede older approved generic
    lessons with explicit lineage
- generalized lesson retrieval/application expansion is now also landed:
  - approved-only hybrid ranking now boosts the right approved generic
    workflow lesson using normalized subject overlap plus preferred and
    avoided-action overlap
  - prompt guidance now tells the model to include scoped competing actions or
    signals in the hybrid query
  - prompt guidance now limits generic workflow application to the top
    directly relevant hint or two
  - semantic routing for generic lessons is still not live
- broader project-rule learning is now also landed:
  - named-project operating rules can now be captured without expanding the
    project-fact field registry
  - project rules now normalize project scope plus subject and preferred or
    avoided actions into reusable generic lesson shapes
  - the same bounded machine review path can auto-promote approved
    `generalized_project_rule` lessons
  - approved project rules now retrieve through approved-only hybrid with
    project-rule ranking boosts and still remain guidance-only
- unmet-need planning is now also landed:
  - named-project missing workflow support can now be captured on the same
    generic pipeline through `generalized_unmet_need`
  - the same bounded machine review path can auto-promote approved unmet-need
    recommendations after repeated compatible evidence
  - approved unmet-need artifacts now retrieve through approved-only hybrid
    with project-scope, subject, and needed-capability boosts
  - unmet-need artifacts remain recommendation-only and distinct from workflow
    guidance, project rules, procurement, install, and approval flows
- post-pivot execution path:
  1. reduced-profile self-improving capture integration
  2. later learned-guidance advisory planning
- primary spec:
  - `/memory-system/specs/self-improving-capture-integration`

Fast re-entry reading order:

1. `docs/memory-system/STATUS.md`
2. `docs/memory-system/CURRENT_SLICE.md`
3. `docs/memory-system/OPERATIONAL_RUNBOOK.md`
4. `docs/memory-system/memory-roadmap.md`
5. `docs/memory-system/feature-inventory.md`
6. `docs/memory-system/specs/README.md`
7. `docs/memory-system/specs/implementation-sequencing.md`
8. `docs/memory-system/DECISIONS.md`
9. `docs/memory-system/OPEN_QUESTIONS.md`

## Spec pack entrypoints

Use these docs to move from roadmap to implementation without rediscovering the
architecture each time:

- inventory anchor:
  - `/memory-system/feature-inventory`
- spec index:
  - `/memory-system/specs/README`
- candidate lifecycle:
  - `/memory-system/specs/candidate-confirmation-lifecycle`
- sequencing guide:
  - `/memory-system/specs/implementation-sequencing`
- premortem / guardrails:
  - `/memory-system/specs/premortem`
- architecture-fit review:
  - `/memory-system/specs/architecture-fit-review`
- semantic retrieval routing:
  - `/memory-system/specs/semantic-retrieval-routing`
- generalized lesson auto-review:
  - `/memory-system/specs/generalized-lesson-auto-review`
- generalized lesson retrieval/application:
  - `/memory-system/specs/generalized-lesson-retrieval-and-application`
- self-improving integration:
  - `/memory-system/specs/self-improving-capture-integration`

## Architectural direction

The next phase of this build should stop treating exact phrase matching as the
primary product strategy.

The first bounded production proof of that direction is now live for the
response-style family only.

The correct long-term shape is:

1. fuzzy learning-event detection
2. strict bounded canonicalization
3. candidate-first storage
4. bounded machine review and promotion
5. reviewed expansion of deterministic coverage
6. stable behavior application
7. later advisory planning from approved learned guidance

In other words:

- fuzzy detection is allowed
- fuzzy storage is not
- remembered behavior should feel consistent to the user, not just well-stored

### Retrieval direction

Working-context retrieval should remain hybrid and typed by default.

The semantic retrieval question is no longer “should semantic retrieval exist?”
because a bounded prototype already exists.

The real roadmap question is:

- where should semantic retrieval become part of the normal working-context
  path
- and where should hybrid-first or hybrid-only remain the correct posture

Current direction:

- keep hybrid-first or hybrid-only for:
  - response-style memory
  - explicit named project facts
  - internal governance lineage surfaces
- the first live family-aware semantic routing slice is now:
  - nearby recurring-procedure asks under validated-procedure scope
- the second live family-aware semantic routing slice is now:
  - approved environment-constraint guidance under approved-only project scope
- the third live family-aware semantic routing slice is now:
  - approved workflow-improvement tool-gotcha guidance for
    `vitest_wrapper_required` and `scripts_committer_required`
- introduce semantic rerank or fallback next for:
  - approved API workaround guidance
  - later broader workflow-improvement memory
  - remaining workflow-improvement guidance only if a lower-noise bounded
    retrieval shape emerges
- consider semantic retrieval later for:
  - bounded narrative project-memory expansion
  - unmet-need recommendation artifacts

Detailed routing guidance lives in:

- `/memory-system/specs/semantic-retrieval-routing`

### The three-layer ingress model

#### Layer A — deterministic parser

Keep the current high-confidence bounded parser.

Role:

- cheap, explicit, reviewable shortcut
- exact/near-exact phrases for already-approved subjects
- immediate low-risk capture when confidence is inherently high

This remains valuable, but it should no longer carry the full burden of messy
human phrasing.

#### Layer B — semantic learning-event detector

Add a new first-pass event detector that reasons over:

- raw user turn
- bounded recent transcript context
- optional tool/error context

Its job is to answer:

- what kind of learning event happened?

Not:

- what freeform memory should be written?

The detector must emit a closed structured event union, not free text.

#### Layer C — canonicalizer and bounded gate

The canonicalizer converts detected events into strict internal memory
artifacts only when:

- the event family is supported
- the subject is recognized
- the normalized value is bounded
- the provenance is explainable

If it cannot map the event cleanly, it must refuse durable storage and leave
only observability or a reviewable candidate artifact.

#### Layer D — behavior application

The system needs a stable way to apply approved memory to later turns.

This layer is responsible for:

- assembling the active remembered behavior/profile for the current turn
- resolving precedence across:
  - global preferences
  - response-style requirements
  - project-scoped memory
  - retrieved procedures
- deciding which approved memories should actively influence the reply
- avoiding prompt bloat from irrelevant nearby memories

Without this layer, the system can improve at storage while still feeling
inconsistent to the end user.

### Ambiguity policy

Semantic detection must be paired with an explicit ambiguity policy.

The system should clearly distinguish between:

- safe to normalize and store
- candidate-only and review-needed
- ask a clarifying question
- do nothing

`candidate-only` must not mean a dead-end manual queue.

For supported low-risk families, the intended posture is:

- conservative durable writes
- candidate-with-confirmation for plausible middle-confidence signals
- sparse clarify
- ignore weak ambiguous signals

The rule is:

- broader detection must not mean broader blind writes
- if the detector cannot map an event confidently to a bounded subject, it
  should abstain rather than guess
- no candidate-producing family may rely on a dead background manual queue as
  its normal resolution path

This policy should be visible in logs and review metadata so operators can see
why a turn was:

- accepted
- downgraded
- clarified
- ignored

### Phrase induction flywheel

On top of the semantic detector, add a separate reviewed phrase-induction lane.

Goal:

- let messy real-world phrasing improve the deterministic system over time

Flow:

1. semantic detector recognizes a valid event
2. canonicalizer maps it to an existing approved subject/template
3. phrase induction proposes additional trigger phrases for that same approved
   subject or approved normalized generic lesson cluster
4. proposals land as reviewable phrase-pattern candidates
5. only approved phrase patterns are promoted into the deterministic matcher
   set

Hard rules:

- phrase induction may only extend existing approved canonical subjects or
  approved normalized generic lesson clusters
- it may not invent new memory classes
- it may not directly change runtime behavior without review
- typo, grammar, synonym, and paraphrase expansion is allowed only inside the
  bounded target subject

This is how we get the upside of broader semantic capture without surrendering
deterministic control.

### User repair and memory control

As semantic detection broadens, user repair becomes part of the product, not
just an operator concern.

The roadmap must explicitly support user-visible control loops for:

- correcting a remembered fact or preference
- superseding an older remembered value
- explicitly telling the system not to remember something
- requesting that a prior remembered item be forgotten or ignored

The goal is:

- when the system remembers something wrong or too aggressively, the user has a
  predictable recovery path

This should remain bounded and auditable, but it must feel like normal product
behavior rather than a hidden operator-only mechanism.

The v1 target is:

- users can repair memory naturally in conversation
- the system can resolve clear targets from recent applied-memory context
- a full inspection UI is not required before the first semantic families ship

## Event-family roadmap

The semantic detector should not start with every imaginable memory event.
Rollout should be by bounded event families.

### Initial event families

These are the first target families:

1. user correction
2. durable response-style preference / requirement
3. recurring procedure
4. tool gotcha / workflow improvement

These are the right starting set because they are:

- high frequency
- user-visible
- structurally bounded enough to normalize safely

### Next-wave event families

After the initial four are stable:

5. project fact
6. project fact correction
7. recurring checklist
8. missing capability / unmet need
9. external API failure lesson
10. outdated knowledge correction
11. better approach discovered
12. recurring environment constraint
13. recurring deployment/runtime constraint
14. recurring debugging preference
15. recurring review preference
16. repeated anti-pattern to avoid

### Later operator-assist event families

These are useful, but should come later:

17. similar-to-existing-memory merge suggestion
18. stale-memory supersede suggestion outside already-bounded correction lanes
19. candidate dedupe / alias suggestion
20. retrieval miss / memory-gap signal
21. phrase-pattern suggestion for deterministic matcher expansion

## Remaining roadmap

The rest of the roadmap is organized around finishing the real product rather
than replaying old scaffolding phases.

---

## Phase A — stabilize the current bounded live system

### Goal

Keep the currently accepted live boundary stable while shifting development out
of production-first proofing.

### Deliverables

- isolated proof environment remains the default surface for risky memory work
- production rollback posture stays explicit for both:
  - image/code rollback
  - runtime-state rollback
- compact state updates reflecting Slice 7 reality
- no expansion of disabled risky automation during stabilization

### Exit criteria

- production remains healthy and boring
- proof environment is the normal place to validate new memory behavior
- no new live work depends on production pairing/auth experiments

---

## Phase A2 — define memory application and user-control rules

### Goal

Make the remembered system behavior coherent from the user’s point of view
before broadening detection further.

### Deliverables

- explicit behavior-application rules for:
  - response-style memory
  - project-scoped memory
  - procedure retrieval
  - conflict and precedence handling
- explicit ambiguity policy for:
  - accept
  - candidate-only
  - clarify
  - ignore
- explicit user repair/control flows for:
  - correction
  - supersede
  - forget / do not remember
  - remove stale remembered behavior
  - stop applying remembered behavior

### Exit criteria

- the system has a clear plan for how approved memory changes later replies
- the system has a clear plan for how users can repair bad memory
- semantic expansion is no longer blocked on hidden ambiguity or control gaps

Primary specs:

- `/memory-system/specs/behavior-application`
- `/memory-system/specs/user-repair-and-memory-control`
- `/memory-system/specs/ambiguity-and-clarification`

---

## Phase A1 — productionize off-production-proven governance surfaces

### Goal

Bring the already-built and already-non-production-validated governance
surfaces into explicit production reality, one bounded family at a time.

This phase is now split into:

- a quick-win tranche to execute first
- a wait tranche to defer until after the next user-facing semantic work

Current phase note:

- the quick-win governance tranche is complete:
  - validated-procedure retrieval
  - candidate procedure promotion
  - procedure validation
  - skill-candidate planning and creation
  - procurement planning and internal procurement-record creation
- the remaining governance backlog is now wait-tranche work:
  - manual Skill Vetter handoff preparation and vetting-result recording
  - approval planning and approval-state recording
  - manual install handoff and install-record creation

### Scope

These are not speculative builds. They already exist and have been exercised
off-production:

- validated-procedure retrieval
- candidate procedure promotion
- procedure validation
- skill-candidate planning and creation
- procurement planning and internal procurement-record creation
- manual Skill Vetter handoff preparation and vetting-result recording
- approval planning and approval-state recording
- manual install handoff and install-record creation

### Deliverables

- explicit inventory of which of the above are:
  - configured in production but not yet production-proven
  - production-proven only as internal tool surfaces
  - not yet enabled on the live boundary
- explicit quick-win vs wait-tranche split
- narrow production proof plans for each family
- operator-facing runbook steps for each family
- explicit decision for each family:
  - bring online now
  - keep manual-only
  - keep disabled

### Hard rules

- do not batch all governance families into one risky rollout
- no actual installation
- no automatic Skill Vetter invocation
- no autonomous procurement or approval
- no external follow-up actions

### Exit criteria

- the quick-win governance tranche has explicit production status and runbook
  coverage
- the wait tranche has explicit defer reasons instead of remaining ambiguous
- nothing remains in the ambiguous state of "built and tested elsewhere but
  not deliberately brought online" for quick-win governance surfaces

Primary spec:

- `/memory-system/specs/governance-surface-productionization`

---

## Phase B — semantic learning-event detector v1

### Goal

Replace the brittle phrase-first front end with a bounded semantic detector for
the first four event families.

### Target event families

1. user correction
2. durable response-style preference / requirement
3. recurring procedure
4. tool gotcha / workflow improvement

### Deliverables

- a typed learning-event detector over:
  - raw user turn
  - bounded transcript context
  - optional tool/error context
- closed event unions with explicit confidence and evidence fields
- canonical mapping for supported events into:
  - `learning`
  - `correction`
  - `procedure`
  - `improvement`
- explicit refusal path when the event cannot be safely normalized
- observability for:
  - detected event family
  - canonicalization outcome
  - rejection reason
- explicit ambiguity outcomes:
  - accept
  - candidate-only
  - clarify
  - ignore

### Exit criteria

- the system no longer depends on exact phrasing for common correction and
  response-style events
- at least several natural phrasings per supported subject work live without
  adding hand-authored regexes first
- deterministic storage shape remains bounded and auditable
- false positives stay controlled through explicit abstain/clarify behavior

Primary specs:

- `/memory-system/specs/semantic-event-detector`
- `/memory-system/specs/ambiguity-and-clarification`
- `/memory-system/specs/messy-language-eval`

---

## Phase C — deterministic phrase induction v1

### Goal

Turn good semantic detections into reviewed expansions of the deterministic
matcher set.

### Deliverables

- `phrase_pattern_candidate` artifact type or equivalent reviewed pattern store
- reviewed proposals for:
  - synonyms
  - minor grammar variants
  - typo-tolerant variants
  - paraphrase variants
- first approved-generic-lesson targets for the same reviewed learning path
- promotion path from approved phrase-pattern candidates into the deterministic
  matcher surface
- dedupe rules for repeated phrase suggestions against the same subject

### Hard constraints

- only for already-approved canonical subjects
- candidate-only first
- no direct behavior change without review
- no open-ended regex synthesis

### Exit criteria

- new real user phrasings can improve deterministic coverage over time
- the matcher set becomes broader without hand-authoring every phrase
- bounded policy review remains in control of what is promoted
- approved phrase induction materially reduces future semantic misses for the
  same bounded subjects and the first approved generic lesson clusters

Primary spec:

- `/memory-system/specs/phrase-induction`

---

## Phase D — remembered response-style profile that feels real

### Goal

Make response-style memory feel noticeably useful in normal use.

### Scope

Bound this phase to durable reply-style subjects such as:

- concise replies
- bullet points
- plain English
- no tables unless asked
- numbered steps when giving instructions

### Deliverables

- robust semantic detection for these subjects
- clean correction-vs-learning disambiguation
- overlap-aware retrieval for style questions and answer generation
- stable behavior-application rules so the remembered style actually governs
  later replies consistently
- reviewed phrase induction for high-volume paraphrases
- clear stale-memory supersede behavior for bounded corrections
- explicit user repair flow for:
  - wrong style memory
  - outdated style memory
  - over-applied style memory

### Exit criteria

- users can express these preferences in many natural ways
- later sessions reliably follow them
- overlap between multiple approved style memories does not confuse the answer
  path
- users can predictably fix wrong remembered style behavior without operator
  intervention

Primary specs:

- `/memory-system/specs/response-style-profile`
- `/memory-system/specs/behavior-application`
- `/memory-system/specs/user-repair-and-memory-control`
- `/memory-system/specs/phrase-induction`

---

## Phase E — recurring procedure memory

First bounded live recurring-procedure tranche:

- reusable named-checklist memory is now live for:
  - deploy checklist
  - release checklist
  - triage checklist
  - investigation checklist
- medium-confidence recurring-procedure candidate confirmation without manual
  review is now live for this bounded family
- recurring-procedure correction or supersede is now live for the supported
  checklist subjects
- clear checklist asks now have production-backed validated-procedure retrieval
  for this family
- nearby deploy/release/triage/investigation asks now have production-backed
  validated-procedure retrieval through bounded procedure-key inference and
  suggestion-first guidance
- report:
  - `/memory-system/PRODUCTION_RECURRING_PROCEDURE_UX_REPORT`
  - `/memory-system/PRODUCTION_RECURRING_PROCEDURE_BEHAVIOR_REPORT`

### Goal

Ship one reusable procedure lane that creates obvious user-visible value.

### Scope

Support strongly structured, bounded recurring procedures such as:

- deploy checklist
- release checklist
- bug triage checklist
- investigation checklist

### Deliverables

- semantic procedure detection for strongly structured reusable instructions
- canonical procedure representation
- candidate + review + promotion flow
- retrieval/use path for later relevant requests
- clear exclusion rules for vague one-off instructions
- explicit behavior-application rules for when a stored procedure should:
  - be suggested
  - be used directly
  - be omitted
  - never be silently applied in the background

### Exit criteria

- a user can teach one reusable checklist/procedure once
- the system can retrieve and use it later in a relevant context
- procedure memory remains bounded and reviewable
- procedure reuse feels obviously helpful rather than surprising or intrusive

Current phase note:

- the first bounded recurring-checklist tranche is complete for its intended
  scope
- the first behavior-side expansion inside that bounded checklist family is now
  complete for its intended scope
- broader procedure families still remain future work inside this phase

Primary spec:

- `/memory-system/specs/recurring-procedure-memory`

---

## Phase F — workflow improvement and tool-gotcha memory

### Goal

Capture recurring operational lessons that improve future work without jumping
to autonomous execution.

### Scope

First bounded live tranche:

- repeated tool-gotcha lessons are now live for:
  - using `pnpm test -- <path-or-filter>` instead of raw Vitest
  - using `scripts/committer "<msg>" <file...>` instead of manual
    `git add` + `git commit`
  - avoiding `git stash` in this multi-agent repo
- repeated environment constraints are now live for:
  - Python command unavailable on this host or environment
  - gateway `POST /tools/invoke` forbidden in this environment
- first-seen supported lessons enter pending confirmation rather than
  immediate approval
- later confirming evidence can auto-promote an approved workflow lesson
- later repo-operating asks can surface the approved lesson as bounded
  guidance only
- weak ambiguous environment phrasing is now production-proven as a no-write
  path on the transcript assist seam
- report:
  - `/memory-system/PRODUCTION_WORKFLOW_IMPROVEMENT_UX_V2_REPORT`
  - `/memory-system/PRODUCTION_ENVIRONMENT_CONSTRAINT_UX_REPORT`

Bound the broader phase to operational learnings such as:

- a specific tool gotcha
- a recurring API failure workaround
- a repeated workflow improvement
- a repeated environment constraint

### Deliverables

- event detection for tool gotcha / workflow improvement
- canonical improvement-note representation
- candidate confirmation or stricter review-first storage depending on risk
- retrieval hooks that can surface approved operational lessons later as
  guidance
- observability separating:
  - user-facing durable preferences
  - operator/workflow improvements
- explicit non-goal:
  - no direct operational execution from this memory family

### Exit criteria

- the system can remember recurring operational lessons
- these lessons do not silently become autonomous actions
- review remains in control of broad workflow changes

Current phase note:

- the first bounded workflow-improvement tranches are complete for their
  intended scope
- broader workflow-improvement v2 is now also complete for its intended scope
- the first generalized supervised lesson learning pivot slice is now also
  complete for its intended scope
- generalized lesson auto-review and promotion is now also complete for its
  intended scope
- approved workflow lessons currently remain guidance-only
- semantic retrieval is now live only for approved environment constraints
  plus the safest approved workflow tool gotchas inside this phase
- repeated API workaround memory is now live for the first bounded family, but
  semantic retrieval for that family still remains future work inside this
  phase
- broader workflow lessons no longer require per-lesson key registration for
  explicit repo-local workflow guidance
- current generic workflow-learning limits in this phase:
  - broader lessons now use bounded held-cluster auto-review instead of
    indefinite manual review
  - retrieval stays on the approved-only hybrid path with normalized generic
    workflow ranking boosts
  - semantic routing remains limited to the older bounded approved families
  - the first bounded project-rule family is now live on the same generic
    learning substrate
  - unmet-need planning still remains future work
- the next work in this phase is no longer more lesson-key expansion; it is:
  - unmet-need planning on the same generic pipeline
  - reduced-profile self-improving capture integration after the broader
    generic families share the same retrieval posture

Primary spec:

- `/memory-system/specs/workflow-improvement-memory`
- `/memory-system/specs/generalized-lesson-learning`
- `/memory-system/specs/generalized-lesson-auto-review`
- `/memory-system/specs/generalized-lesson-retrieval-and-application`
- `/memory-system/specs/project-rule-learning`

---

## Phase G — broader bounded project memory

First bounded live tranche:

- explicit named-project facts are now live for:
  - default branch
  - staging branch
  - primary package manager
  - primary environment name
- proof is currently production-backed for:
  - default branch
  - primary package manager
- report:
  - `/memory-system/PRODUCTION_PROJECT_MEMORY_UX_REPORT`

### Goal

Expand project memory from a few narrow facts into a small but meaningfully
useful bounded project profile.

### Recommended target fields

- default branch
- staging branch
- repository URL
- deployment URL
- primary package manager
- primary environment name

### Deliverables

- semantic project-fact detection for explicit named-project statements
- bounded field normalization
- candidate/review/promotion behavior by risk level
- retrieval for later direct project questions
- correction and supersede flow for supported project facts
- explicit project-scope precedence rules so global memories do not override the
  active project fact incorrectly

### Exit criteria

- at least several bounded project-fact fields are reliable
- later project questions retrieve the right approved fact in fresh sessions
- project memory remains explicit and non-speculative

Primary spec:

- `/memory-system/specs/project-memory-expansion`

---

## Phase H — missing capability and recommendation-only planning

### Goal

Represent repeated unmet needs without enabling autonomous procurement or
installation.

### Landed v1 scope

Recommendation-only unmet-need artifacts for named-project missing workflow
support on the same generalized learning pipeline.

### Deliverables

- event detection for repeated named-project unmet-need statements
- normalized `generalized_unmet_need` candidate shapes
- held-cluster auto-review and promotion through the existing workflow
  improvement lifecycle
- approved-only hybrid retrieval with unmet-need scope, subject, and
  capability boosts
- strict separation between recommendation-only guidance and governance or
  execution flows

### Exit criteria

- the system can remember repeated unmet needs
- no autonomous install/procurement occurs
- approved unmet-need artifacts remain recommendation-only and retrievable
  through the same generic path

Primary spec:

- `/memory-system/specs/unmet-need-planning`

---

## Phase I — enable reduced-profile self-improving capture

### Goal

Turn on the already-built reduced-profile self-improving candidate lane only
after the native event taxonomy and canonicalization rules are strong enough.

### Deliverables

- narrowed allowed event families for self-improving capture
- candidate-only output posture enforcement
- explicit provenance showing self-improving origin
- conflict/duplicate handling against native deterministic and semantic lanes
- operator guidance for when self-improving output should be trusted or ignored
- integration into the same generalized lesson clustering and auto-review path
  rather than a parallel review system

### Exit criteria

- self-improving capture increases useful candidate coverage without bypassing
  the canonicalizer
- candidate quality is acceptable enough to justify the added surface
- no direct approvals, installs, or proactive execution are enabled by this
  step

Primary docs:

- `/memory-system/SELF_IMPROVING_AGENT_ADOPTION_PLAN`
- `/memory-system/SELF_IMPROVING_AGENT_FORK_SPEC`
- `/memory-system/specs/self-improving-capture-integration`
- `/memory-system/specs/semantic-event-detector`
- `/memory-system/specs/ambiguity-and-clarification`
- `/memory-system/specs/messy-language-eval`

---

## Phase J — learned-guidance advisory planning

### Goal

Let approved learned lessons inform bounded advisory planning only after
approval, retrieval, and repair quality are strong enough.

### Scope

Advisory-only guidance such as:

- preflight reminders
- "use X instead of Y here" suggestions
- "trust X for this scope" reminders
- "avoid Y here" warnings

### Deliverables

- a read-only advisory layer over approved learned guidance
- explicit attribution from advisory output back to approved lesson ids
- conflict handling for competing learned guidance
- no execution authority and no silent plan mutation

### Exit criteria

- approved learned lessons can influence planning as guidance
- irrelevant lessons do not create advisory noise
- no new action-taking path appears

Primary spec:

- `/memory-system/specs/learned-guidance-advisory-planning`

---

## Phase K — broader automation only after memory quality is real

### Goal

Expand automation only after detection, canonicalization, retrieval, and review
quality are clearly strong enough.

### Possible later expansions

- broader advisory scheduler classes
- broader execute-class scheduling
- contradiction/drift review beyond the current narrow posture
- more capable consolidation
- tightly bounded vetting/approval flows

### Hard rule

Do not treat this as the default next step. It is intentionally later than the
user-visible memory-quality phases.

### Exit criteria

- memory quality is already good enough that broader automation solves a real
  operator problem instead of amplifying noise

---

## Acceptance bar for future slices

Future memory slices should clear all of these:

1. a normal user would notice the benefit without reading docs
2. the benefit appears in a later session, not only at ingest time
3. the slice reduces repetition or correction burden in a visible way
4. the slice keeps candidate vs approved behavior explicit
5. the slice does not require risky production proofing during discovery

This is the new quality bar after Slice 7.

## Evaluation bar for messy real-world language

The roadmap must not treat “many natural phrasings” as a vague aspiration.

Every semantic-detection slice should carry a messy-language eval corpus with:

- typo-heavy phrasing
- small grammar errors
- fragments and shorthand
- indirect correction language
- paraphrases
- conflicting-context examples
- false-positive traps

The system should be evaluated on:

- correct event-family detection
- correct canonical subject mapping
- acceptable abstain/clarify behavior
- false-positive rate
- whether approved memories later change visible behavior correctly

No semantic-detection slice should be considered complete without this gate.

## Things that are explicitly not enough anymore

The following do not justify a full slice by themselves:

- one more regex or phrase variant
- one more candidate-only field with no later retrieval value
- a win that depends on fallback duplicate suppression but produces no broader
  user-visible loop
- another purely internal proof that does not change day-to-day remembered
  behavior

## Ongoing requirements

After every slice:

- update `STATUS.md`
- update `DECISIONS.md`
- update `OPEN_QUESTIONS.md`
- adjust `CURRENT_SLICE.md` only when the next slice is explicitly chosen
- update operational docs when rollout or proof posture changes
- keep the roadmap aligned with what is actually live, not what was once
  planned
