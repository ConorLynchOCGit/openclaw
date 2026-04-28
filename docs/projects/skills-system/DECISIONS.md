---
summary: "Durable decisions for the Skills System project."
title: "Skills System Decisions"
---

# Skills System Decisions

## Accepted decisions

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
