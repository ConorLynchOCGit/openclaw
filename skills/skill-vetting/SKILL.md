---
name: skill-vetting
description: Review third-party skills before installation. Use when a skill from ClawHub, GitHub, or another source needs search, quarantine acquisition, risk analysis, or a final install/inspire/reject recommendation.
metadata: { "openclaw": { "always": true } }
---

# Skill Vetting

Use this skill before installing or borrowing from any third-party skill.

This is a quarantine-first workflow that must emit a durable operator-facing
report.

## Use this skill when

- the user wants a ClawHub skill reviewed
- a skill bundle was shared locally and needs risk review
- you need to decide whether to `install`, `inspire`, or `reject`

## Core workflow

1. Search for the candidate if needed.
   - Prefer `openclaw skills search "<query>"` when available.
   - Otherwise use `clawhub search "<query>"` when available.
2. Acquire into quarantine only.
   - Use `{baseDir}/scripts/quarantine_clawhub_skill.sh <slug> [version]` when
     `clawhub` is available.
   - Do not pass a literal `latest`; omit the version argument when you want
     the latest published version.
   - The quarantine helper may use the registry force flag for suspicious
     skills because the bundle is still isolated and pending review.
   - If quarantine-safe acquisition is unavailable, stop at search/document
     review and record the acquisition blocker explicitly.
3. Start the durable report.
   - Use `{baseDir}/scripts/init_vetting_report.sh <slug> [version]`.
   - Save reports under:
     - `docs/projects/skills-system/skill-vetting/reports/`
4. Inspect the bundle.
   - Read `SKILL.md` first.
   - Then inspect only the scripts/references that materially affect behavior.
5. Produce a review with exactly one outcome:
   - `install`
   - `inspire`
   - `reject`

## Required output fields

Use the checklist and template in:

- `{baseDir}/references/quarantine-review-checklist.md`
- `{baseDir}/references/operator-vetting-report-template.md`

## Guardrails

- never install an unreviewed third-party skill into the live workspace
- never use `openclaw skills install` as the acquisition step for an unreviewed
  skill, because it writes into the active workspace
- treat public marketplace availability as discovery only, not trust
- if a skill contains ideas worth borrowing but is not safe to install, choose
  `inspire`
- record the actual runtime surface used for:
  - native `openclaw` search
  - `clawhub` search
  - quarantine acquisition
- if native `openclaw` exists only inside the runtime container, record that
  explicitly instead of pretending host and runtime are the same surface

## Related canonical docs

- `../../docs/projects/skills-system/skill-vetting/specs/quarantine-review-workflow.md`
- `../../docs/projects/skills-system/skill-vetting/specs/clawhub-search-and-acquisition.md`
- `../../docs/projects/skills-system/skill-vetting/specs/skill-risk-evaluation.md`
- `../../docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md`
- `../../docs/projects/skills-system/skill-vetting/specs/runtime-proof-and-surface-matrix.md`
- `../../docs/projects/skills-system/skill-vetting/specs/decision-routing-and-follow-on-actions.md`
- `../../docs/projects/skills-system/skill-vetting/runtime-surface-proof.md`
