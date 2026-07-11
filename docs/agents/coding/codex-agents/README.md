# Execution Coding Codex Agents

Execution Coding uses native Codex custom agents inside the Codex app-server
workbench. OpenClaw launches, observes, mirrors, and receipts the outer Coding
session; these helpers are not OpenClaw task/session agents.

Repo inspection:

- For multiple independent searches, reads, globs, or git inspections, helpers
  should prefer the Codex-native `openclaw_repo_workbench` MCP when available.
- The workbench is read-only. It is not a validation runner and must not become
  an OpenClaw-side surrogate workbench.
- Exact one-file lookup can use direct Codex file read or MCP.
- Tests, builds, validation, formatting, and command-specific evidence use
  ordinary Codex command execution.
- Edits use Codex-native edit/patch behavior.
- Broad shell exploration before MCP/helper use on a broad task requires a
  short fallback reason. Focused shell commands do not.
- Do not invent `validation_run_many` or a fake `multi_tool_use.parallel`.

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
- `codex_reviewer`: truthful full-scope completion plus Codex-native
  team/workbench behavior, helper use, parent rework, and OpenClaw dynamic-tool
  leakage.
- `creative_quality_reviewer`: Business Ops creative, message, channel, and
  publication-readiness review.
- `native_fit_reviewer`: OpenClaw/GBrain/Codex architecture fit, duplicate
  authority, and control-layer risk.
- `architect_reviewer`: module boundaries, APIs, lifecycle, data models, and
  maintainability.

Team shape:

- Do not spawn unbounded or autonomous helper trees. Delegate when task shape
  merits it, using the smallest team shape that covers the risk.
- The Coding parent spawns one layer of direct purpose-agent children; leaf
  children do not recursively delegate.
- Prefer bounded decision episodes: one uncertainty, a small evidence budget,
  one Context Pack, then parent action. Do not assign one child a whole-project
  tour or continuously stream ordinary findings.
- `solo`: one or two known files, a small patch, low ambiguity, and low review
  risk.
- `light team`: broad read-heavy docs/source/domain work, validation risk, or
  review risk. Use the canonical `project_explorer` before broad parent
  inspection, and use the smallest reviewer set that can catch the material
  failure mode.
- `architecture team`: cross-runtime, OpenClaw/Codex/GBrain, deploy/proof,
  tool/readback behavior, or multi-surface changes. Include planning,
  native-fit/architecture, validation, and review roles when they affect the
  decision.

Do not spawn all reviewers by default. Coding chooses the smallest reviewer set
whose trigger applies and records skipped-reviewer rationale in closeout for
nontrivial work.

For long, multi-surface, or spec-driven work, use `codex_reviewer` to reconcile
the exact governing artifacts, diff, validation, helper evidence, and proposed
completion claim. A valid first slice remains `partial` until the full objective
is complete.
