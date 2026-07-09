---
title: American Atomics Content Production Predicates Workbench Proof
status: active_coding_proof_prompt
created_at: 2026-07-09
source_basis:
  - docs/projects/execution-platform/prompts/american-atomics-brand-intake-planning-artifact-20260707.md
  - docs/projects/execution-platform/prompts/american-atomics-business-ops-content-production-predicates-coding-package-20260709.md
runtime_boundary: internal_repo_docs_templates_config_only
---

# American Atomics Content Production Predicates Workbench Proof

## Main Handoff Instruction

Route this to Coding through the normal Main -> task(agentId:"coding") path.

Do not route back to Planning. Planning already produced the preserved
implementation entry packet.

Do not summarize this prompt into the operative scope. Pass Coding the
runtime-visible file path below plus chars/digest metadata:

```text
docs/projects/execution-platform/prompts/american-atomics-content-production-predicates-workbench-proof-20260709.md
```

Coding must read this file directly before implementation and report the
observed chars/digest in its closeout. If Coding cannot read the file, Coding
must stop as blocked rather than work from Main's summary.

## Objective

Extend the American Atomics Business Ops foundation so later agents can move
from asset/brand/source intake into content generation, design direction,
review routing, and measurement without producing generic AI slop or unsafe
public-company investor communications.

This is still an internal docs/templates/config slice. It must create the
missing predicates for later content/design work. It must not create public
copy, official brand assets, legal policy, approved claims, external-system
writes, or accepted-truth GBrain memory.

## Current-State Assumption

The first American Atomics brand-intake proof already created or updated the
core asset/brand foundation:

- reusable asset-intake ledger template;
- reusable brand-intelligence foundation template;
- reusable distinctive-brand-assets template;
- reusable approval-safe content foundation template;
- American Atomics project instantiations for those artifacts;
- candidate/internal labels and approval boundaries;
- source hierarchy, voice examples, banned examples, and basic asset/brand
  links.

Do not reimplement that first-leg scope unless inspection shows a specific gap.
Extend it with the predicate package below.

## What Remains Unexhausted From The Preserved 29k Planning Artifact

The preserved 29k Planning artifact established the larger Business Ops goal:
make American Atomics a dogfood case for reusable asset/source/voice/brand
workflow that prevents generic AI investor-content slop while preserving
approval boundaries.

The unexhausted follow-on work is the predicate layer needed before later
content generation, design exploration, review routing, and measurement.

The system still lacks:

1. normalized source claim units;
2. an audience/channel operating map;
3. a pre-draft content brief;
4. a content variant lab for candidate/banned ideas;
5. a creative direction brief;
6. a concrete design asset request sheet;
7. content-specific review routing;
8. a measurement baseline;
9. a production-readiness predicate register.

## Non-Goals

- No public copy.
- No public campaign.
- No official logo.
- No official color palette or type system.
- No securities/legal advice.
- No official disclaimer language.
- No approved investor claims.
- No claim that Yahoo or third-party market pages are canonical proof.
- No external publication, website/social update, paid media, email send, CRM,
  Notion, or external-system write.
- No accepted-truth GBrain writeback.
- No new runtime, parser gate, state machine, workflow engine, CRM, project
  management app, or duplicate memory system.

## Required Workbench And Team Behavior

This proof also tests Codex-native execution behavior.

Coding should:

- read this full prompt file directly;
- use `openclaw_repo_workbench` MCP tools for broad independent repo inspection
  if they are attached and suitable:
  - `repo_search_many`;
  - `repo_read_many`;
  - `repo_glob_many`;
  - `git_inspect_many`;
- use shell for precise one-off commands, validation commands, or when MCP is
  unavailable/unsuitable;
- decide early whether to use Codex helpers before broad parent inspection;
- use `project_explorer` for current repo conventions unless unavailable or not
  useful;
- use `codex_reviewer` or `code_reviewer` after the docs diff exists unless
  unavailable or not useful;
- record helper use/skips and MCP use/skips in closeout;
- never use OpenClaw `sessions_spawn`, `sessions_yield`, `task`, or
  `sessions_history` as Coding's inner-team fallback.

Do not force delegation for a tiny task. This task is not tiny. If Coding runs
solo, the closeout must explain the concrete unavailability or suitability
reason.

## Implementation Scope

Create reusable templates and American Atomics project instantiations for the
missing predicates below. Keep all filled American Atomics project artifacts
clearly labeled `candidate_internal_unapproved`.

### 1. Source Claim Library

Reusable template:

- `business-ops/onboarding/templates/source-claim-library.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/source-claim-library.md`

Purpose:

- turn source material into reusable claim units before any content generation;
- distinguish facts, inferences, opinions, forbidden claims, and unknowns;
- record source tier, source ref, owner, approval status, confidence,
  freshness/review date, allowed transformations, prohibited transformations,
  public-use boundary, and required next check.

American Atomics should include at least these starter claim units:

- public issuer identifiers from the investor page;
- `rock to reactor` as sourced public phrase but not automatically approved as
  a continuing platform;
- energy sovereignty / domestic nuclear fuel-cycle territory as owned-public
  language requiring freshness and approval review before new public use;
- uranium exploration-stage company positioning;
- Yahoo/property details as degraded third-party research seeds only;
- HALEU/fuel-cycle/future-facing ambition as high-risk claim family requiring
  primary source plus legal/securities approval;
- operator-provided shareholder-base growth objective as internal strategy, not
  public-copy proof.

### 2. Audience And Channel Map

Reusable template:

- `business-ops/onboarding/templates/audience-channel-map.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/audience-channel-map.md`

Purpose:

- map audience segments to motivations, objections, proof needs, channel fit,
  content formats, risk level, approval needs, and measurement proxy.

American Atomics should include at least:

- uranium/nuclear retail investors;
- AI-power and energy-infrastructure investors;
- critical minerals / energy-security investors;
- speculative junior-mining watchlist investors;
- existing shareholders;
- skeptical public-market observers.

Channels should include website, investor deck, X, LinkedIn, newsletter/email,
short-form video, CEO/founder voice, and investor-relations/news release
surfaces. Mark channel status as `unknown`, `candidate`, or `requires source`.

### 3. Content Brief

Reusable template:

- `business-ops/onboarding/templates/content-brief.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/content-brief.md`

Purpose:

- create the pre-draft record for a single content unit or content batch;
- require objective, audience, channel, source claim IDs, proof tier, risk tier,
  approval route, design assets, CTA, variant count, measurement proxy, and
  blocked/unblocked status before generating drafts.

Important boundary:

- This is not the content itself.
- Examples may be included only as internal/candidate/unapproved placeholders.

### 4. Content Variant Lab

Reusable template:

- `business-ops/onboarding/templates/content-variant-lab.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/content-variant-lab.md`

Purpose:

- compare candidate hooks, angles, motifs, post structures, deck section
  treatments, visual concepts, and banned ideas before drafting;
- record source support, audience fit, distinctiveness, slop risk, compliance
  risk, stage-boundary clarity, approval need, test metric, and disposition.

American Atomics starter variants should include:

- macro problem -> company fact -> stage boundary -> next evidence;
- rock-to-reactor as internal narrative architecture;
- what we can say / cannot say yet;
- map/proof-card formats;
- banned AI-power hype;
- banned guaranteed-upside or production/supply implication;
- banned generic glowing-green nuclear trope unless deliberately tested and
  approved.

### 5. Creative Direction Brief

Reusable template:

- `business-ops/onboarding/templates/creative-direction-brief.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/creative-direction-brief.md`

Purpose:

- bridge brand intelligence into design execution without creating official
  brand assets;
- document visual territories, source assets required, allowed references,
  banned tropes, color/type/logo boundaries, deck/social/website format needs,
  proof/footnote treatment, and design-review owners.

American Atomics starter territories:

- source-led proof ladders;
- uranium geology/maps/project evidence;
- domestic energy-security infrastructure;
- reactor/grid/fuel-chain diagrams;
- sober public-market trust language;
- avoid sci-fi radiation cliches, meme-stock visuals, and generic neon
  radioactive green unless deliberately tested.

### 6. Design Asset Request

Reusable template:

- `business-ops/onboarding/templates/design-asset-request.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/design-asset-request.md`

Purpose:

- convert "missing logo/deck/social/assets" into a concrete intake checklist;
- request file name/path, owner, source, rights/permission, approval status,
  version/date, intended use, required metadata, and public-use boundary.

American Atomics should request:

- official logo source files and permitted variants;
- colors and typography;
- approved investor deck source file;
- current filings/press releases;
- project maps/technical diagrams that are public and approved;
- website source/brand assets;
- social account list and recognized disclosure-channel status;
- analytics baseline or approved public metrics;
- disclaimer/forward-looking statement language and owner.

### 7. Content Review Route

Reusable template:

- `business-ops/onboarding/templates/content-review-route.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/content-review-route.md`

Purpose:

- define review tiers for internal notes, candidate drafts, public investor
  copy, technical claims, financial/securities claims, and design assets;
- assign reviewer type by content stakes, not availability;
- record exit criteria, blocked states, required evidence, and approval artifact
  location.

American Atomics should explicitly separate:

- internal planning review;
- brand/voice review;
- source/factual review;
- technical/project review;
- legal/securities review;
- final publication approval.

### 8. Measurement Baseline

Reusable template:

- `business-ops/onboarding/templates/measurement-baseline.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/measurement-baseline.md`

Purpose:

- define what can be measured before content production begins;
- separate public metrics, internal metrics, legally/privacy-sensitive metrics,
  unknown metrics, and forbidden data.

American Atomics should include:

- reach;
- engagement quality;
- follower/subscriber growth;
- deck downloads or deck requests if available;
- inbound investor inquiries if approved to track;
- website referral traffic if analytics are approved;
- content save/share/comment quality;
- shareholder-base proxies only if legally/operationally approved;
- explicit exclusion of raw private shareholder data and raw analytics exports
  unless separately approved.

### 9. Production Readiness Predicate Register

Reusable template:

- `business-ops/onboarding/templates/production-readiness-predicate-register.md`

American Atomics instantiation:

- `business-ops/companies/american-atomics/projects/investor-content-system/production-readiness-predicate-register.md`

Purpose:

- consolidate what must exist before content generation, design exploration,
  deck work, website work, social publishing, paid media, or GBrain accepted
  writeback can proceed.

American Atomics starter predicate rows should include:

- legal/securities reviewer identified;
- official disclaimer/forward-looking statement language supplied;
- current filings/press releases linked;
- approved investor deck obtained;
- official logo/color/type files obtained;
- social accounts and recognized disclosure channels identified;
- analytics baseline permission established;
- claim library reviewed;
- review route approved;
- content brief completed;
- design asset request fulfilled;
- measurement baseline approved;
- GBrain writeback scope approved or explicitly blocked.

## Existing Files To Update

Update these docs to reference the new predicate layer:

- `business-ops/onboarding/template-index.md`
- `docs/templates/agency-intelligence/domain-playbooks/business-ops-onboarding.md`
- `business-ops/companies/american-atomics/projects/investor-content-system/project-brief.md`
- `business-ops/companies/american-atomics/projects/investor-content-system/campaign-brief.md`
- `business-ops/companies/american-atomics/projects/investor-content-system/source-ledger.md`
- `business-ops/companies/american-atomics/projects/investor-content-system/decision-log.md`
- `business-ops/companies/american-atomics/projects/investor-content-system/proof-log.md`
- `business-ops/companies/american-atomics/brand-profile.md`
- `business-ops/companies/american-atomics/voice-and-style.md`
- `business-ops/companies/american-atomics/assets-and-links.md`
- `business-ops/companies/american-atomics/constraints-permissions-risk.md`

Do not rewrite unrelated sections. Add concise references and open questions
only where useful.

## Completion Standard

The slice is complete only if:

- all nine reusable templates exist;
- all nine American Atomics project instantiations exist;
- each American Atomics instantiation is clearly labeled
  `candidate_internal_unapproved`;
- the source-claim library includes source tier, source ref, approval status,
  confidence, freshness/review date, allowed transformations, prohibited
  transformations, and public-use boundary;
- the audience/channel map connects segment, motivation, objection, channel,
  content format, risk, approval, and measurement;
- the content brief is a pre-draft record, not public copy;
- the variant lab includes candidate and banned examples;
- the creative-direction brief documents design territories without creating
  official design assets;
- the design-asset request turns unknown assets into exact requested materials;
- the review route separates brand, source, technical, legal/securities, and
  final publication review;
- the measurement baseline separates public, internal, sensitive, unknown, and
  forbidden metrics;
- the predicate register states which future work is blocked and why;
- template index and Business Ops domain playbook discover the new templates;
- project/company docs point to the predicate layer without duplicating it;
- decision log and proof log record the docs/templates/config slice;
- no public copy, official brand asset, legal policy, approved claim, external
  write, or accepted-truth GBrain writeback is created;
- Coding closeout says "predicate package slice complete" rather than "content
  system complete" or "public production ready";
- Coding closeout records full prompt file read evidence, MCP use/skip evidence,
  and helper use/skip evidence.

## Validation Commands

Run from `/home/node/.openclaw/workspace` in the live Coding thread:

```bash
git diff --check -- \
  business-ops/onboarding/template-index.md \
  business-ops/onboarding/templates \
  business-ops/companies/american-atomics \
  docs/templates/agency-intelligence/domain-playbooks/business-ops-onboarding.md
```

```bash
for f in \
  business-ops/onboarding/templates/source-claim-library.md \
  business-ops/onboarding/templates/audience-channel-map.md \
  business-ops/onboarding/templates/content-brief.md \
  business-ops/onboarding/templates/content-variant-lab.md \
  business-ops/onboarding/templates/creative-direction-brief.md \
  business-ops/onboarding/templates/design-asset-request.md \
  business-ops/onboarding/templates/content-review-route.md \
  business-ops/onboarding/templates/measurement-baseline.md \
  business-ops/onboarding/templates/production-readiness-predicate-register.md \
  business-ops/companies/american-atomics/projects/investor-content-system/source-claim-library.md \
  business-ops/companies/american-atomics/projects/investor-content-system/audience-channel-map.md \
  business-ops/companies/american-atomics/projects/investor-content-system/content-brief.md \
  business-ops/companies/american-atomics/projects/investor-content-system/content-variant-lab.md \
  business-ops/companies/american-atomics/projects/investor-content-system/creative-direction-brief.md \
  business-ops/companies/american-atomics/projects/investor-content-system/design-asset-request.md \
  business-ops/companies/american-atomics/projects/investor-content-system/content-review-route.md \
  business-ops/companies/american-atomics/projects/investor-content-system/measurement-baseline.md \
  business-ops/companies/american-atomics/projects/investor-content-system/production-readiness-predicate-register.md
do
  test -f "$f" || exit 1
done
```

```bash
rg -n "candidate_internal_unapproved|candidate / internal / unapproved" \
  business-ops/companies/american-atomics/projects/investor-content-system
```

```bash
rg -n "public copy|official logo|official brand|legal advice|approved claim|external-system write|GBrain" \
  business-ops/companies/american-atomics/projects/investor-content-system \
  business-ops/onboarding/templates
```

## Reviewer Questions

Reviewer should judge:

- Did Coding read the full prompt file or operate from Main's summary?
- Did Coding use the Codex workbench MCP where broad inspection made it useful?
- Did Coding use helper agents where this task merited it?
- Does the package actually unlock later content/design work, or only add more
  static docs?
- Are the predicates explicit enough that a later content agent will know what
  it can and cannot use?
- Are public-company risk boundaries preserved?
- Are design and voice capabilities made more concrete without inventing
  official assets?
- Are source and measurement limitations honest?
- Did Coding overclaim completion?

## Future Work After This Slice

After this predicate package is accepted, the next safe slices are:

1. source refresh and primary-source capture for filings, press releases, and
   current deck;
2. voice exploration using the claim library and content variant lab;
3. design exploration using the creative-direction brief and official asset
   request responses;
4. internal sample content batch, explicitly candidate/unapproved;
5. reviewer/legal/securities approval-route dry run;
6. approved GBrain pointer summary only after operator approval.
