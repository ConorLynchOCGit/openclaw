---
summary: "Canonical QA scenario pack architecture and source-of-truth direction."
title: "Scenario Pack Architecture"
---

# Scenario Pack Architecture

Canonical source of truth for QA scenarios:

- `qa/scenarios/index.md`
- `qa/scenarios/*.md`

Direction preserved from the prior scattered design notes:

- markdown-authored scenario pack
- human-readable in review
- machine-parseable
- rich enough to drive:
  - suite execution
  - QA workspace bootstrap
  - QA Lab UI metadata
  - docs and discovery prompts
  - report generation

The remaining split surfaces still needing follow-through are:

- `extensions/qa-lab/src/suite.ts`
- `extensions/qa-lab/src/report.ts`
