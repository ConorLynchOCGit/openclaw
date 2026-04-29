---
summary: "Durable decisions for the Skills System project."
title: "Skills System Decisions"
---

# Skills System Decisions

## Accepted decisions

### 2026-04-29 - Candidate discovery needs auditable validation before UI proof

Reason:

- removing keyword gates and deterministic snippet selection from
  skill/proactivity discovery does not prove the whole funnel is correct
- candidate quality can still fail at packet assembly, model proposal,
  deterministic validation/dedupe, or card presentation
- the broader memory stack still contains deterministic logic; some of it is
  required guardrail behavior, while deterministic semantic judgment needs
  review before it becomes hidden candidate authority
- prior passes repeatedly let deterministic value judgment reappear in new
  layers. The audit must therefore be elimination-oriented, not advisory-only.

Decision:

- deterministic guardrails remain allowed for ids, hashes, schemas, caps,
  redaction, refs, provenance, cooldowns, dedupe, persistence boundaries,
  projection materialization, and unsafe-output demotion
- deterministic code must be audited when it decides candidate meaning,
  usefulness, ranking, classification, or surfacing without model review
- runtime deterministic value judgment is presumed unsafe at scale unless it is
  proven to be a valid guardrail or acceptable structural retrieval constraint
- findings classified as `runtime_elimination_debt` or
  `test_enshrinement_debt` are failing debt; runtime debt should be removed,
  replaced with explicit structural filters, or moved behind bounded model
  review, while test debt should be removed or rewritten to assert model-owned
  boundaries before further Phase 1/2 memory promotion
- skill/proactivity candidate review gains a golden corpus of real OpenClaw and
  Codex episodes with expected surfaced candidates, expected demotions, and
  expected no-candidate outcomes
- validation records whether a miss came from a thin packet, model miss,
  post-model validation suppression, unexpected candidate, or no-candidate
  expectation
- local function-level tests and golden-corpus validation run before any live
  gateway rebuild; live UI proof is reserved for wiring confirmation after the
  underlying packet/reviewer/validator/presentation stack passes
- later shadow mode should let the operator mark missed candidates and then
  trace whether the failure was packet context, model review, validation/dedupe,
  or visible-card presentation

### 2026-04-29 - Visible cards require model-authored copy and contiguous review packets

Reason:

- the latest live proof showed the candidate reviewer accepted a legitimate
  proactive plan, but the card path converted it into a generic follow-up,
  skipped model-authored presentation because of prioritization caps, and then
  surfaced/demoted deterministic fallback text with a mangled title
- deterministic packet assembly also starved the candidate reviewer: it passed
  one OpenClaw proof prompt, duplicated Codex cooldown text, two short Codex
  progress updates, generic command summaries, no touched areas, and no
  validation-failure substance
- this repeated the same failure pattern in a deeper layer: deterministic code
  was no longer keyword-gating candidates, but it was still deciding which
  context the model could judge

Decision:

- candidate-review packets are contiguous high-context work episodes, not
  adjacency-selected or role-balanced "interesting" snippets
- deterministic packet assembly may enforce recency, source boundaries, size
  caps, redaction, refs, hashes, provenance, cooldowns, and schemas; it must not
  decide semantic relevance or candidate usefulness by content selection
- OpenClaw candidate packets include a configurable last-N contiguous
  user/assistant turn window
- Codex candidate packets include a configurable contiguous session window with
  user asks and assistant finals preserved, plus meaningful command/validation
  summaries, touched areas, and outcomes where available
- loaded-but-low-signal Codex evidence is degraded evidence, not proof of good
  Codex coverage
- all visible proactivity, skill, reverse-prompt, draft-ready, repair, and
  follow-up cards require model-authored `UserFacingProactivityBrief` primary
  copy
- deterministic brief text is hidden fallback input and diagnostics only; when
  model-authored copy is disabled, unavailable, invalid, or unclear, the item is
  demoted or hidden instead of surfacing deterministic prose
- model-reviewed proactive plans are first-class `proactive_plan`
  opportunities, not generic follow-up rows
- display titles remain separate from slugs, focus keys, normalized intent
  keys, and ids; normalized keys must never become visible card titles
- proof must support test-mode cooldown/force-run controls and must include
  packet-quality diagnostics so tests do not wait on production cooldowns or
  claim success from thin packets

### 2026-04-29 - Candidate review uses infrequent high-context episode review

Reason:

- skill and proactive-plan discovery is not the same task as model-memory
  capture; memory capture benefits from many atomic facts, while candidate
  discovery needs coherent work episodes and product judgment
- short bounded excerpts preserved safety but lost the narrative continuity that
  lets the reviewer identify higher-leverage skills and plans
- the product goal is a handful of strong candidates per day, not many
  low-value cards or tiny cleanup suggestions
- Codex session activity must be first-class input because implementation,
  debugging, validation, and repeated workflow friction often happen in Codex

Decision:

- candidate review now runs infrequently by structural cadence:
  heartbeat/operator briefing, every `N` assistant finals with default `N=3`,
  session/compaction boundary, and a future explicit manual review hook
- keyword, topic, or phrase prefilters are not part of the candidate-review
  trigger path
- the candidate review packet uses `episodeTurns` with larger caps instead of
  memory-shaped `boundedTurnExcerpts`; default caps should preserve substantial
  recent user turns and assistant finals while still redacting and bounding
  durable artifacts
- the candidate reviewer route is separate from chat, memory capture/retrieval,
  and presentation-brief routes and should default to a higher-quality
  GPT-5.4-class route with medium/high reasoning
- each review may return at most 0-3 proposals and must prefer no candidate over
  marginal candidates
- proposals require repeatability or large avoided cost, clear expected user
  value, and an explicit classification as proactive plan, new skill, existing
  skill enhancement, merge/extend candidate, or demotion
- tiny cleanup candidates, one-off local optimizations, vague checklists, and
  clipped source-fragment candidates are rejected or demoted
- Codex session activity is included through a read-only bounded adapter where
  available; proof skips are degraded unless the local/dev Codex session path
  is genuinely unavailable
- sanitized episode packet artifacts may be persisted for auditability, but raw
  full transcripts, raw prompts, raw model responses, raw tool logs, secrets,
  private phrases, hidden reasoning, and unbounded OpenClaw/Codex session logs
  remain forbidden
- model-reviewed candidates remain proposals only and cannot write canonical
  memory truth, install/promote skills, execute actions, send messages, or
  mutate files

### 2026-04-28 - Candidate discovery is model-reviewed from bounded recent-work episodes

Reason:

- deterministic scripts are the wrong primary mechanism for subjective product
  questions such as which repeatable process should become a skill, which
  proactive next step matters now, and whether a candidate is new, an existing
  skill enhancement, a merge, or not worth surfacing
- recent raw conversation review produced better skill and proactive-plan
  candidates than deterministic ledger fragments, because it preserved the real
  work episode: user corrections, assistant finals, examples, decision
  pressure, and follow-up context
- no-dark-data must not be interpreted as "the model cannot inspect recent
  transcript/activity"; it means raw full transcript/activity must not become
  hidden durable state or skill artifacts

Decision:

- candidate discovery now uses a two-stage trigger:
  - Stage 1 is a deterministic cheap prefilter for structural runtime events:
    assistant finals, heartbeat/session boundaries, validation/proof failures,
    and card-quality or dismissal events
  - Stage 1 does not inspect content for skill/proactivity/candidate/workflow
    words, correction phrases, recurring-work phrases, or turn-count semantics;
    those judgments belong only to the model trigger evaluator
  - Stage 2 is a bounded model trigger evaluator that decides whether there is
    enough signal, which recent refs belong in the window, and whether the
    review goal is skills, proactivity, both, or none
- accepted trigger decisions build a larger bounded episode packet and call a
  model candidate reviewer to propose proactive plans, new skills,
  existing-skill enhancements, merge/extend candidates, and demotions
- live model input may include capped recent user turns, assistant finals,
  card diagnostics, validation summaries, activity summaries, loaded skill
  metadata, candidate summaries, and Codex session excerpts/summaries
- durable artifacts may store only bounded episode packets, capped excerpts,
  refs, hashes, model route summaries, validation results, classifications,
  and proposals; raw full transcripts, raw prompts, raw tool logs, secrets,
  private phrases, hidden reasoning, and unbounded OpenClaw/Codex session logs
  remain forbidden
- model trigger decisions and candidate proposals are not semantic truth; they
  cannot write canonical memory, install or promote skills, execute actions,
  send messages, mutate files, or become fuzzy duplicate authority
- deterministic validators remain mandatory for allowed refs, caps, no-dark
  data, confidence thresholds, cooldowns, max calls, dedupe, provenance, and
  write eligibility
- model route configuration for trigger evaluation, candidate review, and
  presentation briefs must remain isolated from default chat and model-memory
  capture/retrieval routes

### 2026-04-28 - Proactivity decision briefs may be model-authored, but remain presentation-only

Reason:

- the deterministic `UserFacingProactivityBrief` boundary fixed raw packet
  projection, but clipped source fragments and generic fallback copy still
  passed structural checks
- examples such as `Already recurring`, `Build the bounded request with`, and
  `Turns a recent idea into a bounded next step` are not useful operator
  decision surfaces even when they contain no ids, source refs, or timestamps
- Milestone 4 evals should measure clear human decision cards, not the failure
  mode of deterministic string cleanup

Decision:

- a bounded model-authored rewrite/evaluation step may produce
  `UserFacingProactivityBrief` primary copy from typed, bounded, no-dark-data
  proactivity state
- the first runtime target is the separate `openai-codex/gpt-5.4`
  proactivity-presentation route with strict JSON output, medium reasoning by
  default, low verbosity, and small output/token/time bounds; this does not
  alter strict MMV2 capture/retrieval defaults
- model-authored briefs are presentation-only and are not canonical ledger
  truth, semantic memory, dedupe authority, supersession authority, lifecycle
  state, skill package state, install authority, send authority, or action
  authority
- raw prompts, transcripts, tool logs, secrets, private phrases, and unbounded
  session text must not be included in model prompt input or persisted output
- deterministic validators remain mandatory after model output; invalid,
  generic, repetitive, unsafe, schema-invalid, or unclear briefs are demoted
  instead of surfaced
- if the model cannot name a capability, decision, or outcome; explain what it
  does or unlocks; and provide one actionable next step, it must choose
  `demote`
- model prompt and raw response text must not be persisted; proof and telemetry
  may store bounded summaries, hashes, model id, elapsed time, validation
  status, and reason codes only
- this is not semantic forest code because no model-authored presentation text
  can write canonical semantic state or infer duplicate truth

### 2026-04-28 - Proactivity cards render decision briefs, not ledger packets

Reason:

- Skillifier and proactivity cards were exposing internal planning packet shape
  directly: why-now blocks, lifecycle labels, source-derived fragments, draft
  state, and handoff templates competed in the primary body
- heartbeat output was clearer because it already turns hidden structured
  context into a user-facing operator briefing
- Milestone 4 skill evals would be measuring noisy surfaces if the presentation
  boundary stayed implicit

Decision:

- proactive ledgers continue to store rich internal state, provenance, evidence,
  lifecycle, source refs, ids, and diagnostics
- user-facing surfaces render a typed `UserFacingProactivityBrief` with a short
  title, kind label, one-line purpose, recommended next step, and primary
  action label
- `why now`, evidence summaries, source refs, provenance, ids, timestamps,
  limitations, and presentation diagnostics belong in collapsed details or
  hidden context
- skill candidates must distinguish new skills from existing-skill
  enhancements and merge/extend candidates using explicit skill metadata,
  candidate linkage, or existing candidate records
- reverse prompts must pass a hard question-quality gate before primary
  surfacing; malformed questions are demoted to diagnostics or self-healing
  repair signals
- presentation briefs are not semantic truth and must not become routing or
  duplicate authority

### 2026-04-28 - Skillifier MVP drafts must stay bounded, linked, and non-installing

Reason:

- Milestone 2 already produces canonical `skill_candidate` records with stable
  ids across proactivity surfaces
- the next runtime gap is not candidate detection; it is the lack of one
  explicit flow that turns a candidate into a reviewable skill draft
- destination authority becomes operationally meaningful at the moment draft
  files are written

Decision:

- Skillifier MVP consumes canonical `skill_candidate` records and must not
  invent a parallel candidate-to-skill path
- one canonical `skillPackageId` must link the originating candidate, the
  generated draft package, the provenance report, the rollback plan, and the
  deterministic check report
- draft packages are bounded draft artifacts, not installed or promoted skills
- scaffold generation may use bounded distilled evidence only; raw prompts,
  full transcripts, raw tool logs, secrets, and private phrases remain
  forbidden
- Milestone 3 default draft targets are limited to:
  - `<workspace>/skills/<name>/`
  - optional scoped experiment path `<workspace>/.agents/skills/<name>/`
- `skills/<name>/` remains repo branch/worktree-only and must not be silently
  mutated on `main`
- broader targets such as `~/.agents/skills`, `~/.openclaw/skills`, plugin
  skill directories, and Codex `$CODEX_HOME/skills` remain out of the
  automatic draft-write path in this milestone
- draft packages written into workspace-local skill roots must remain review
  only and non-promoted; they may be discoverable for inspection, but they
  must not become normal active skill behavior by default

### 2026-04-28 - Draft-ready state must reuse proactivity surfaces

Reason:

- the product already has inline, heartbeat, inbox, and handoff surfaces with
  canonical ids
- a separate Skills inbox or draft-only dashboard at Milestone 3 would repeat
  the same fragmentation that the skill-candidate ledger just removed

Decision:

- the originating `skill_candidate` remains the primary surface identity
- draft-ready state must surface through the existing proactivity queue, inbox,
  heartbeat, and handoff flows using the same canonical candidate id
- supporting package/report/provenance detail may appear as secondary
  disclosure, but the primary surface remains one bounded operator-facing work
  item
- live usefulness and draft reviewability are the Milestone 3 acceptance gate

### 2026-04-28 - `skill_candidate` becomes a first-class proactivity opportunity kind

Reason:

- Milestone 1 established that skills must reuse the proactivity substrate
  rather than introducing a second review queue
- the runtime still lacked one canonical, persisted, bounded record for
  recurring work that should become a skill
- candidate quality and duplicate control are the main risks in the first
  runtime slice

Decision:

- `skill_candidate` is now a first-class proactivity opportunity kind
- the canonical runtime state for skill candidates lives in the existing
  proactivity storage and surfacing path
- candidate creation must use bounded distilled evidence only:
  - repeated task pattern summaries
  - repeated command or workflow summaries
  - repeated user correction summaries
  - recurring validation failure summaries
  - bounded before or after outcome summaries
- raw prompts, full transcripts, raw tool logs, secrets, and private phrases
  remain forbidden inputs and artifacts
- candidate ids must remain canonical across inline surfacing, heartbeat,
  inbox, and handoff
- recurring work updates the existing canonical candidate when the
  deterministic intent key matches instead of creating duplicate actionable
  rows
- destination capability authority remains a policy reference in this
  milestone; broad runtime writing of skill packages is still out of scope

### 2026-04-28 - Skills become a proactivity-integrated lifecycle platform

Reason:

- loading, installation, and vetting are necessary primitives, but they do not
  solve how repeated work becomes a reusable skill
- the existing proactivity system already owns bounded surfacing, canonical
  ids, heartbeat, inline cards, inbox, and handoff
- adding a separate skills inbox or candidate queue would duplicate product
  surfaces and fragment review state

Decision:

- the Skills System now owns a full lifecycle platform, not just installed
  skill folders and marketplace posture
- skill candidates are future typed platform records linked into the existing
  proactivity ledger and surfaces
- skills are lifecycle-managed capabilities spanning:
  - candidate detection
  - candidate ledger
  - Skillifier packaging
  - evals and routing coverage
  - vetting and risk classification
  - cross-runtime packaging
  - canary and rollback
  - health and maintenance
- the canonical implementation sequence is tracked in
  [Phase 2 Skills Platform Roadmap](/projects/skills-system/phase-2-skills-platform-roadmap)

### 2026-04-28 - Low-risk skill automation is allowed, but broad or risky behavior remains gated

Reason:

- requiring operator approval for every low-risk skill draft or promotion would
  make the user the throughput bottleneck
- skills are a safer first test bed for bounded automation because they are
  versionable, scope-limited, and easy to disable or roll back
- approval boundaries still matter for anything executable, networked,
  credentialed, or broadly enabled

Decision:

- the Skills Platform uses an autonomy ladder rather than one global
  review-everything rule
- low-risk instruction-only skill work may eventually auto-draft, auto-test,
  auto-canary, and in some cases auto-promote into limited scopes after
  passing defined checks
- medium-risk and high-risk skill work remains approval-gated for install or
  broad enablement
- blocked classes such as credential grabs, raw transcript persistence,
  exfiltration, obfuscated code, unsafe eval/exec, and hidden outbound sends
  remain non-promotable
- all automatic skill changes must be versioned, provenance-bearing, and
  rollback-safe

### 2026-04-28 - Skill destination authority must be explicit and path-specific

Reason:

- OpenClaw can discover skills from multiple destinations, but destination
  readability is not the same thing as destination write authority
- using one blanket write policy would blur repo-owned bundled skills,
  workspace-scoped experiments, machine-wide shared skills, plugin-owned
  assets, and Codex-global installs

Decision:

- the Skills Platform must define a destination capability matrix covering:
  - readable
  - writable
  - installable
  - auto-promotable
  - requires host-operator
  - requires repo branch or worktree
  - requires explicit approval
  - forbidden
- `skills/<name>/` is repo-owned and writable only through branch/worktree
  flow, never by silent direct mutation on `main`
- `<workspace>/skills/<name>/` is the default future low-risk auto-draft and
  limited-promotion target
- `<workspace>/.agents/skills/<name>/` is valid for agent-local scoped
  experiments
- `~/.agents/skills/<name>/` and `~/.openclaw/skills/<name>/` remain broadly
  readable, but writes stay approval-gated until later proof
- plugin skill directories remain approval-gated and are not early
  auto-written targets
- Codex `$CODEX_HOME/skills/<name>/` may be written only through the
  cross-runtime install adapter with explicit capability checks

### 2026-04-18 - Skills System gets its own canonical project

Reason:

- skill loading, safety, marketplace acquisition, and review outputs had become
  bigger than a footnote in other projects

Decision:

- create `docs/projects/skills-system/` as the canonical project home

### 2026-04-18 - Skill Vetting remains a workstream under Skills System

Reason:

- it is substantial enough for its own durable pack
- it still belongs under the parent skill-system governance boundary

Decision:

- keep `skill-vetting` nested under `docs/projects/skills-system/`
- do not register it as a separate top-level project workspace

### 2026-04-18 - External skill acquisition must use quarantine first

Reason:

- `openclaw skills install` writes into the active workspace
- that is correct for trusted installs, but wrong for unreviewed third-party
  skill analysis

Decision:

- acquisition for vetting must land in quarantine
- review decides `install`, `inspire`, or `reject`

### 2026-04-18 - Search and acquisition are separate capabilities

Reason:

- search may be available through native OpenClaw surfaces even when quarantine
  acquisition tooling is not

Decision:

- allow search-only mode when native search exists
- fail closed on acquisition when quarantine-safe download tooling is absent
