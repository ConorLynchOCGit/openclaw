---
summary: "Threat model and required review rubric for external skill analysis."
title: "Skill Risk Evaluation"
---

# Skill Risk Evaluation

## Objective

Make skill reviews concrete and repeatable instead of informal.

## Threat model

Review for at least these risks:

- arbitrary shell execution
- writes outside expected working directories
- hidden network egress or data exfiltration
- credential or token expectations
- log injection or chat injection behavior
- operator-deceptive behavior
- broad filesystem reads unrelated to the stated purpose

## Required evidence sources

- `SKILL.md`
- bundled scripts
- metadata requirements
- referenced files that materially affect behavior
- install/update instructions

## Required output fields

- `skill`
- `version`
- `review_scope`
- `command_surfaces`
- `filesystem_surfaces`
- `network_surfaces`
- `secret_requirements`
- `safety_notes`
- `useful_ideas_to_borrow`
- `outcome`
- `install_conditions`
- `rationale`

## Outcome meanings

### `install`

The skill is acceptable to install after review, possibly with stated
conditions.

### `inspire`

The idea is worth keeping, but the bundle should not be installed directly.

This is the correct outcome when the workflow is useful but the implementation
is too risky, too brittle, or too alien to local runtime norms.

### `reject`

Do not install and do not treat the skill as an approved pattern.

## Review discipline

- prefer exact command and file examples over vague concerns
- do not mark `install` unless the review has actually inspected the risky
  surfaces
- do not confuse “interesting” with “safe”
