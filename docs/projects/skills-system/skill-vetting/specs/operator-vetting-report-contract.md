---
summary: "Operator-facing report contract for Skill Vetting reviews."
title: "Operator Vetting Report Contract"
---

# Operator Vetting Report Contract

Every external skill review must end in a durable operator-facing report saved
under:

- `docs/projects/skills-system/skill-vetting/reports/`

The report writer must target the writable operator workspace copy by default,
for example:

- `/root/.openclaw/workspace/docs/projects/skills-system/skill-vetting/reports/`

It must not write generated review reports into read-only imported product
mirrors such as `imports/product_live/content/...`.

## Filename contract

Default report path:

- `docs/projects/skills-system/skill-vetting/reports/YYYY-MM-DD-<skill-slug>-review.md`

Canonical example reports may also use:

- `docs/projects/skills-system/skill-vetting/reports/example-<skill-slug>-review.md`

## Required frontmatter

```yaml
---
summary: "Operator-facing review for <skill-slug>."
title: "Skill Review: <skill-slug>"
review:
  slug: <skill-slug>
  version: <version-or-unknown>
  outcome: install|inspire|reject
  riskTier: low|medium|high|extreme
  generatedAt: <ISO timestamp>
---
```

## Required sections

### 1. Decision snapshot

Must include:

- final outcome
- risk tier
- short verdict sentence
- install conditions
- operator recommendation

### 2. Acquisition record

Must include these exact fields:

- skill slug
- version
- source
- search path used
- acquisition path used
- whether force was required
- quarantine path
- review scope mode:
  - `search_only`
  - `quarantine_review`
  - `blocked_on_acquisition`

### 3. Runtime surface proof

Must record which surfaces were actually tested:

- host shell `openclaw`
- host shell `clawhub`
- runtime-container `openclaw`
- runtime-container `clawhub`

For each surface record:

- `available` or `missing`
- proof command
- observed result

### 4. Review evidence

Must include:

- files inspected
- scripts inspected
- command surfaces found
- filesystem surfaces found
- network surfaces found
- secret or credential surfaces found
- persistence surfaces found

### 5. Risk summary

Use explicit severity tiers:

- `info`
- `low`
- `medium`
- `high`
- `critical`

Each finding must include:

- severity
- surface
- evidence
- why it matters
- whether it blocks install

### 6. Decision routing

Must include one of:

- `install`
- `inspire`
- `reject`

Each route must include structured follow-on fields.

#### `install`

Required fields:

- `install_conditions`
- `allowed_runtime_surfaces`
- `required_operator_checks`
- `policy_follow_on`

#### `inspire`

Required fields:

- `borrow_the_idea_not_the_code`
- `useful_patterns`
- `unsafe_or_nonconforming_parts`
- `recommended_next_output`

#### `reject`

Required fields:

- `blocking_findings`
- `why_no_install`
- `whether_any_idea_should_be_salvaged`
- `operator_reporting_follow_on`

## Install-condition rules

`install_conditions` must never be empty for an `install` outcome.

At minimum it must say:

- where install is allowed
- what binary/runtime prerequisites must exist
- whether the skill is allowed only after a follow-up review or policy update

## Artifact retention rules

- the report stays in repo docs
- quarantine downloads do not stay by default
- if quarantine evidence must be preserved, the report must say:
  - what was preserved
  - where it was preserved
  - why retention was necessary
