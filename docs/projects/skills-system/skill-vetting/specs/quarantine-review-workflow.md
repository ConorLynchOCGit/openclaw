---
summary: "Quarantine-first workflow for acquiring and reviewing third-party skills safely."
title: "Quarantine Review Workflow"
---

# Quarantine Review Workflow

## Objective

Ensure third-party skills are acquired into an isolated temporary review
surface before any install decision touches the live workspace.

## Quarantine root

Default quarantine root:

- `${TMPDIR:-/tmp}/openclaw-skill-vetting/`

Each reviewed skill gets its own timestamped subdirectory.

Example:

- `/tmp/openclaw-skill-vetting/task-progress-stream-20260418T120000Z/`

## Rules

- quarantine is not the live workspace
- quarantine is not the repo tree
- quarantine is not a hidden long-term store
- reviewed artifacts should be deleted after the review is complete unless the
  output explicitly says they must be preserved for follow-on evidence

## Workflow

1. search for candidate skills
2. choose one slug/version for review
3. acquire into quarantine only
   - for suspicious-skill review, force may be used only at the quarantine
     acquisition step because the bundle is still isolated and not approved for
     live workspace install
4. inspect:
   - `SKILL.md`
   - bundled scripts
   - references
   - metadata and install requirements
5. record the decision as:
   - `install`
   - `inspire`
   - `reject`
6. delete the quarantine copy when the review is complete unless the operator
   explicitly wants to retain it temporarily for follow-on comparison

## Forbidden shortcuts

- do not use `openclaw skills install` as the acquisition step for an
  unreviewed skill
- do not install directly into the active workspace just to inspect the files
- do not treat “publicly visible on ClawHub” as a trust signal
- do not reuse quarantine acquisition force as implicit approval for live
  install

## Required review output fields

- skill slug and version
- acquisition path
- commands/binaries required
- filesystem and network risk notes
- useful ideas worth borrowing
- final outcome
- rationale for the outcome
