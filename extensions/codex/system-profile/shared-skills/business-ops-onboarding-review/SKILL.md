---
name: business-ops-onboarding-review
description: Use when reviewer critiques client, project, brand, campaign, or business onboarding plans, templates, records, memory maps, approval flows, or Business Ops onboarding implementation. Checks whether onboarding is strategically useful, agency-grade, source-grounded, privacy-safe, OpenClaw/GBrain-native, and strong enough for downstream copy, content, design, marketing, workflow, planning, and coding agents.
---

# Business Ops Onboarding Review

Use this skill to review onboarding artifacts for a client, business, brand,
project, campaign, or internal dogfood business. It complements
`planning-output-quality-review`, `source-evidence-quality-review`,
`openclaw-gbrain-native-architecture-review`, and
`genericity-slop-risk-review`.

The question is not "does the template exist?" The question is whether the
onboarding record gives later agents real subject matter, strategic direction,
operating boundaries, and memory structure.

The reviewer should judge whether the artifact found the brief. A mechanically
complete profile is still weak if it does not surface the commercially
important tension, evidence boundary, growth/adoption/trust problem, and the
strategic point of view future work should use.

## Review Standard

Block or require revisions when the artifact:

- reads like a generic intake form;
- lacks a real business ambition;
- restates tasks instead of finding the objective, issue, insight, and
  challenge;
- lacks audience, offer, category, competitor, enemy, or proof detail;
- makes brand voice claims without examples;
- stores or asks for secrets in GBrain;
- duplicates CRM/project-management machinery;
- creates a parallel memory system instead of repo artifacts plus GBrain
  summaries/links;
- creates top-level durable `clients/`, `businesses/`, or `organizations/`
  GBrain namespaces when the existing `companies/` taxonomy plus relationship
  metadata fits;
- keeps projects flat when they should be linked or nested under an owning
  company;
- omits stakeholder, approval, privacy, or permission boundaries;
- leaves downstream agents with nothing concrete to use.
- treats a candidate territory as a fact, approval, or canonical brand rule.

## Positive Patterns

Strong onboarding includes:

- impossible ambition or highest commercial outcome;
- brief-finding logic that explains what problem or tension makes the work
  necessary now;
- OIIC-style strategy core;
- love/respect map where brand, voice, loyalty, or content matters;
- evidence-backed audience and market context;
- offer/product/service inventory with proof and constraints;
- category convention, competitor/alternative, enemy, or tension;
- voice/style examples and anti-slop rules;
- asset/source inventory with access boundaries;
- stakeholder and decision-right clarity;
- approval flow and communication norms;
- privacy and permission rules;
- repo artifact structure;
- concise GBrain memory map that uses existing entity homes such as
  `companies/`, `projects/`, `people/`, `concepts/`, `plans/`, and
  `decisions/`;
- 30/60/90 first moves;
- explicit unknowns and high-value questions.

## Review Questions

Ask:

- Could a new planning/copy/content/design/marketing/workflow/coding agent use
  this without re-discovering the business?
- Is the objective measurable or at least decision-shaping?
- Is the issue the real barrier, not a task restatement?
- Is the insight a human/category/operating truth, not product fluff?
- Does the challenge contain an action-oriented shift?
- Are emotional attachment and rational trust both understood where brand
  matters?
- Which claims are sourced, assumed, or unknown?
- Are secret/private details excluded from GBrain?
- Does the file/GBrain layout link and summarize rather than duplicate raw
  material or create a parallel taxonomy?
- Are client, internal-business, vendor, partner, and prospect represented as
  company relationship/status fields rather than duplicate entity families?
- Are project pages or artifacts linked to the owning company?
- Does the approval flow prevent accidental execution before operator/client
  approval?
- Would this make downstream output less generic?
- For a sparse-input brand lab: are territories genuinely divergent under the
  same fact substrate; do name substitution, category collision, behavioral
  voice, public-company safety, creative legs, and operator-decision clarity
  withstand qualitative review?

## Required Output

```markdown
## Verdict

approve | approve_with_required_revisions | block | needs_more_research

## Business Onboarding Findings

- Severity:
  Issue:
  Evidence:
  Required change:

## Strategic Core Review

- Objective:
- Issue:
- Insight:
- Challenge:
- Missing or weak:

## Downstream Usefulness Review

- Copy/content/design/marketing usefulness:
- Planning/coding/workflow usefulness:
- What future agents can use immediately:
- What they would still have to rediscover:

## Memory / File Structure Review

- Repo artifact fit:
- GBrain summary/link fit:
- Privacy/secrets risk:
- Duplicate ownership risk:

## Required Revisions

## Approval Recommendation
```

If the artifact is strategically weak but mechanically complete, require
rewrites. Do not approve a skeletal onboarding surface because it has the right
headings.
