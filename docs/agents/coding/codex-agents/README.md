# Execution Coding Codex Agents

Execution Coding uses native Codex custom agents inside the Codex app-server
workbench. OpenClaw launches, observes, mirrors, and receipts the outer Coding
session; these helpers are not OpenClaw task/session agents.

Repo inspection:

- For multiple independent searches, reads, globs, or git inspections, helpers
  should prefer the Codex-native `openclaw_repo_workbench` MCP when available.
- The workbench is read-only. It is not a validation runner and must not become
  an OpenClaw-side surrogate workbench.

Core helpers:

- `project_explorer`: bounded source, caller, test, and architecture mapping.
- `implementation_planner`: implementation slice planning and validation signal
  selection.
- `implementer`: focused non-overlapping implementation slices.
- `test_engineer`: validation selection and failure triage.
- `docs_researcher`: current official docs and local dependency behavior.

Reviewer boundaries:

- `code_reviewer`: diff correctness, regressions, security, maintainability,
  and missing tests.
- `codex_reviewer`: Codex-native team/workbench behavior, helper use, parent
  rework, and OpenClaw dynamic-tool leakage.
- `native_fit_reviewer`: OpenClaw/GBrain/Codex architecture fit, duplicate
  authority, and control-layer risk.
- `architect_reviewer`: module boundaries, APIs, lifecycle, data models, and
  maintainability.

Do not spawn all reviewers by default. Coding chooses the smallest reviewer set
whose trigger applies and records skipped-reviewer rationale in closeout for
nontrivial work.
