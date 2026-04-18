# Memory Push Spec

## Purpose

Define the first major post-soak memory implementation milestone.

This push is for making memory **functionally improve assistant behavior in ordinary use**, not for proving again that bounded writes are possible.

Why now:

- the bounded production memory soak is already closed as passed for its intended scope
- bounded ordinary live interaction -> candidate capture is now proven
- the next useful milestone is not another narrow proof pause; it is a performance loop that makes memory visibly help later turns

For this milestone, **functional memory** means:

- ordinary turns produce candidate material automatically where the class is approved and low-risk
- relevant approved/session memory is retrieved into normal runtime behavior without manual operator prompting
- low-risk memory classes can promote without full human review on every item
- the system can show evidence that memory improved later behavior, reduced repeated correction, or improved retrieval quality

## Current posture

### Pre-Slice-7 safety gate

Before Slice 7 resumes:

- production must stay on the clean committed gateway image path
- production pairing/auth state must not be used as a proof surface
- production rollback must cover both:
  - image/code rollback
  - runtime-state rollback for gateway/device auth files
- Slice 7 proof work must use an isolated proof gateway with:
  - separate state dir
  - separate ports
  - separate gateway token
  - separate device pairing state
- that isolated proof gateway must not poll production Telegram or reuse the production Control UI browser identity
- the isolated proof gateway now has a dedicated non-production memory-write surface:
  - database `openclaw_slice7_memory_proof`
  - host `127.0.0.1:35432`
  - schema `memory_middleware`
  - memory background jobs disabled

### Already live

- bounded production memory soak is closed as passed
- bounded ordinary live interaction -> candidate capture is proven
- Slice 1 observability foundation is live:
  - `projects/ops/memory_performance_report.sh`
  - `archives/memory_performance_reports/`
- Slice 2 narrow auto-capture profile is live:
  - `user-preference-v1` on `chief` / `main`
  - explicit plain `My preferred X is Y.` / `My favorite X is Y.` user statements
  - candidate-only output with manual review/promotion still in place
- bounded Slice 3 loop is now proven through the live model-tool path:
  - durable preference phrasing can trigger `memory_candidate_submit` automatically without an explicit save request
  - the bounded auto-promotion profile creates a separate approved `feedback` memory row
  - fresh-session retrieval from approved memory is proven
  - explicit `Correction:` preference corrections can auto-submit as candidate-only correction rows
- bounded Slice 4 loop is now proven through the same canonical model-tool path:
  - natural conversational correction phrasing like `Actually, ...` can auto-submit as candidate-only correction rows
  - reviewed correction promotion supersedes the older approved row for the same bounded subject
  - fresh-session retrieval from the corrected approved row is proven
  - the concise-response requirement class can auto-submit, auto-promote, and answer later retrieval questions from approved memory
- bounded Slice 5 expansion is now proven:
  - named project facts can enter the bounded loop as candidate `project` memory
  - natural project-fact corrections can land through the subscriber fallback seam with explicit class/seam attribution
  - reviewed project-fact correction promotion creates approved `project` memory and supersedes the stale approved row for the same bounded subject
  - fresh-session retrieval from the corrected approved `project` row is proven
  - seam-level duplicate suppression is now proven for bounded project-fact corrections when subscriber fallback captured the turn first
- bounded Slice 6 follow-on is now proven:
  - the numbered-steps response requirement class can auto-submit and auto-promote into approved `feedback` memory
  - fresh-session retrieval from the approved numbered-steps row is proven
  - broader natural response-style correction phrasing can reach the bounded `requirement_correction` lane through the canonical model-tool seam
  - reviewed promotion of a bounded response-style correction creates approved `feedback` memory that fresh-session retrieval can use later
  - the canonical seam still remains `model_tool_primary`; this slice reduced misses by broadening bounded managed-content normalization rather than changing boundaries
- bounded Slice 7 follow-on is now proven:
  - previously problematic natural response-style correction phrasings can now stay in the bounded correction lane:
    - `I meant plain English, not jargon.`
    - `No, use bullet points for me.`
  - bounded correction-vs-learning disambiguation now uses raw turn text and transcript context so model paraphrase drift does not force these phrasings into new `learning` rows
  - overlapping approved response-style memories now rank cleanly by matching template for direct fresh-session questions
  - wider bounded named project-fact coverage is now proven for another explicit field:
    - `For project atlas forge, the default branch is atlas-main.`
    - this remains candidate-only `project` memory with no auto-promotion
  - the canonical seam still remains `model_tool_primary`; subscriber fallback remains a bounded assist path and duplicate-suppression seam rather than the canonical seam
- procurement/install automation remains intentionally unchanged after Slice 4:
  - no autonomous install/procurement behavior is live
  - future expansion should be recommendation-first through the existing skill-candidate planning/procurement surfaces
- canonical DB-proof path exists for the real middleware ledger:
  - `projects/ops/memory_soak_db_report.sh`
  - `archives/memory_soak_db_checks/`
- documented memory architecture already includes:
  - event ledger
  - context manager
  - typed durable memory store
  - procedure distiller
  - skill promotion pipeline
  - background consolidator
- bounded memory subsystem and bounded governance system exist
- bounded advisory scheduler classes exist:
  - `proactive_plan`
  - `consolidation_plan`
- bounded execute classes exist for safe duplicate/stale actions and drift checks

### Still disabled

- self-improving capture in production
- automatic Skill Vetter invocation
- procurement/install automation
- actual installation
- contradiction execution
- consolidation-driven drift remediation
- memory-slot takeover
- broader proactive classes beyond the current bounded live set

### Proven

- bounded retrieval, bounded governance writes, bounded scheduler classes, runner ownership, and bounded growth behaved as designed for the soak’s intended scope
- ordinary live interaction can create the expected candidate path on the approved boundary
- there is now a canonical DB-level proof path for the real memory ledger, rather than relying on the local SQLite file index

### Not yet delivering clear user-visible improvement

- ordinary-turn capture is still limited to bounded preference/correction classes rather than the broader approved low-risk default
- retrieval is now proven for approved preference feedback memory, but not yet broad enough across other classes to claim general memory improvement
- low-risk promotion is live for bounded explicit user preferences, but not yet for other approved classes
- observability exists in pieces, but not yet as a clean operator-facing proof loop for “memory helped later behavior”

## Diagnosis

The current system has a real memory substrate and governance chain, but not yet a complete performance loop.

What exists today:

- memory substrate: yes
- candidate/governance path: yes
- functional memory improvement in ordinary use: not yet reliably

Primary bottlenecks:

1. candidate capture is still too dependent on explicit/structured flows instead of ordinary-turn defaults
2. retrieval is too separate from normal runtime behavior and still depends too much on manual/tool-explicit paths
3. promotion is too manual for low-risk classes where the system already has bounded evidence and low blast radius
4. observability is too weak to prove that later behavior improved because of memory rather than coincidence or operator prompting

The real problem is not missing architecture. The real problem is that the current architecture is not yet closed into a visible learning loop.

## Target outcomes

This push must deliver a first-loop target for four things:

### 1. Automatic ordinary-turn candidate capture

- ordinary live turns on approved agents should emit candidate material automatically for approved low-risk classes
- capture should focus on classes with high utility and low promotion risk:
  - stable user preferences
  - durable operator corrections
  - reusable procedures with clear success/failure shapes
  - recurring project/workflow facts that matter later
- capture should remain bounded and policy-aware

### 2. Automatic retrieval integration into live behavior

- approved memory and bounded session memory should be pulled into runtime behavior without requiring the operator to explicitly ask for memory tools
- retrieval should affect real answers in the main operating agents
- retrieval integration should prefer relevance and restraint over flooding context

### 3. Bounded low-risk promotion

- selected low-risk classes should be promotable with reduced manual burden
- the first low-risk profile should stay narrow, reversible, and audit-friendly
- higher-risk memory classes must remain manual until the first loop is stable

### 4. Observability / measurement

- operators must be able to see:
  - raw turn volume
  - candidate volume
  - approved-memory growth
  - retrieval hits / retrieval use
  - repeated-correction reduction over time
  - specific examples where later behavior improved due to stored memory
- observability must distinguish substrate activity from actual behavior improvement

## Scope

### In scope

- automatic ordinary-turn candidate capture for approved low-risk classes
- retrieval integration for approved memory and bounded session memory in main operating agents
- bounded low-risk promotion for selected memory classes
- measurement/observability that can prove whether memory is helping
- DB-proof and telemetry instrumentation needed to measure the loop accurately
- rollback-safe checkpoints and operator-facing validation artifacts

### Explicitly out of scope

- procurement/install automation
- actual installation or environment mutation driven by memory
- broad contradiction execution
- broad self-improving autonomy
- memory-slot takeover
- broad consolidation-driven drift remediation
- broad proactive automation beyond the currently bounded classes
- generalized auto-promotion for medium/high-risk memory classes

## Proposed rollout slices

### Slice 1 — Observability foundation

Purpose:

- make the real ledger and raw-turn volume measurable before changing capture/promotion behavior

Deliver:

- canonical read path for:
  - raw turn volume
  - event volume
  - candidate volume
  - approved-memory growth
  - retrieval-use counters if available
- one durable report shape that can be reused during rollout
- one operator-friendly comparison view: turns vs candidates vs approvals vs retrievals

Why first:

- without this, later claims about improvement are too easy to fake or overread

### Slice 2 — Ordinary-turn capture default

Purpose:

- make ordinary turns automatically emit candidate material for approved low-risk classes

Deliver:

- approved low-risk class list
- first live profile:
  - `user-preference-v1`
  - allowed agents: `chief`, `main`
  - accepted forms: explicit plain `favorite` / `preferred` user preferences
- broaden capture beyond that first narrow class only after duplicate/noise behavior stays controlled
- bounded exclusions for noisy/transient classes
- audit trail that shows candidate generation source and class

Why second:

- it creates enough candidate volume for the loop to matter

### Slice 3 — Retrieval integration

Purpose:

- ensure stored memory actually affects responses in ordinary runtime behavior

Deliver:

- automatic retrieval path for approved memory
- bounded session-memory retrieval path where relevant
- retrieval use instrumentation
- prompt/runtime wiring so retrieval is default behavior where appropriate, not a separate operator ritual

Why third:

- candidate volume alone does not improve behavior; retrieval is the first user-visible gain

### Slice 4 — Low-risk promotion profile

Purpose:

- reduce manual review burden only where risk is genuinely low and utility is high

Deliver:

- first low-risk promotion profile
- explicit allowed classes and exclusions
- rollback path for bad promotion behavior
- audit trail linking approval/promotion outcomes to source candidates

Why fourth:

- promotion should speed up the loop only after capture and retrieval are already observable and stable

### Slice 5 — Reduced-profile self-improving capture (optional later)

Purpose:

- only if the first loop is stable and visibly helping, evaluate a reduced-profile self-improving capture layer

Deliver:

- only after slices 1–4 prove value
- remains separate from this push unless the earlier slices clearly justify it

## OpenClaw vs Codex split

### OpenClaw should own

- specification work
- policy/classification work
- low-risk prompt/runtime logic design
- observability/report design
- DB-proof artifact review
- validation interpretation
- runbook/roadmap/spec updates
- bounded safe code/doc changes that do not strand the runtime

### Codex should own

- host/container/runtime-dangerous implementation steps
- live runtime config changes that could strand OpenClaw
- Docker/restart/rebuild work
- live DB migration execution
- rollback/restore operations
- any change that requires host/container authority not visible from normal OpenClaw turns

## Risk model

### Runtime risk

- retrieval integration can increase prompt size, latency, or cause context confusion
- automatic capture can add write volume or unexpected background cost

### Quality / regression risk

- retrieval can surface wrong or stale memory
- automatic capture can overfit transient chatter as durable signal
- promotion can lock in wrong corrections or misleading procedures

### Over-capture risk

- too many candidates reduce review quality and inflate storage without improving behavior
- weak class boundaries can turn casual chatter into false durable memory

### Bad-promotion risk

- low-risk auto-promotion can still create durable mistakes if the classes are too broad or the validation is weak
- rollback-safe audit trails are mandatory

### False-confidence / observability risk

- event growth can be mistaken for useful memory growth
- candidate volume can rise while later behavior remains unchanged
- retrieval logs can exist without meaningful response improvement
- the milestone must measure behavior improvement, not just backend motion

## Success metrics

At minimum track:

- raw turn volume
- candidate volume
- approved-memory growth
- retrieval hit / retrieval use
- repeated correction reduction
- examples of improved later behavior

Recommended operator-facing metrics:

- turns per day/week by approved agent
- candidates per 100 turns by class
- approved promotions per class over time
- retrievals used in answered turns
- repeated-correction recurrence rate before vs after promotion
- concrete before/after examples where the assistant remembered:
  - a stable user preference
  - a recurring correction
  - a reusable procedure
  - a project-specific operating fact

## Recommended first implementation order

1. **Observability foundation**
   - build the measurement path first
   - do not change capture or promotion behavior blind
2. **Automatic ordinary-turn candidate capture for low-risk classes**
   - start with the smallest classes that clearly matter later
3. **Retrieval integration into live runtime behavior**
   - make memory affect answers by default where appropriate
4. **Low-risk promotion profile**
   - only after candidate volume and retrieval use are visible and stable
5. **Only then consider reduced-profile self-improving capture**
   - and only if the above loop is clearly helping

## First recommended implementation slice

**Slice 1 — Observability foundation**

Concrete objectives:

- identify the canonical raw-turn telemetry source
- identify the canonical event/candidate/review counters in the real middleware ledger
- produce one reusable daily/weekly memory-performance report shape
- add enough instrumentation to compare:
  - turns
  - candidates
  - approved promotions
  - retrieval use
- ensure all of the above are readable without unsafe manual DB spelunking each time

Why this is first:

- it gives the team a way to prove the next slices helped rather than merely changed volume

## First recommended validation slice

**Validation 1 — one bounded behavior-improvement proof**

Required proof shape:

1. an ordinary live turn creates candidate material automatically for an approved low-risk class
2. that item becomes available through the approved review/promotion path
3. a later ordinary live turn retrieves the promoted memory automatically in a relevant context
4. the later answer is measurably better because of that retrieval
5. the report shows the corresponding turn/candidate/retrieval metrics

This is the first proof that the loop is functionally helping, not just recording.

Current proof status:

- satisfied for the bounded preference feedback lane
- satisfied for one bounded project-fact lane with correction supersede + fresh-session retrieval
- not yet satisfied for broader procedure classes or broader project-fact coverage beyond the named bounded lane

## First rollback-safe checkpoint

Checkpoint after Slice 1 only:

- observability/reporting paths in place
- no broader automation changed yet
- capture/promotion behavior unchanged or minimally instrumented only
- durable checkpoint committed before enabling any wider automatic ordinary-turn capture

This checkpoint is the safe boundary before moving from proof/measurement into behavior-changing automation.
