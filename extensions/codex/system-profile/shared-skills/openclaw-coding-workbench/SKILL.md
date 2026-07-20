---
name: openclaw-coding-workbench
description: Use for broad or multi-file repository inspection in Codex Coding, especially when the task spans Business Ops and nested OpenClaw source, requires batched search/read/glob/git inspection, or needs TypeScript symbol evidence before implementation.
---

# OpenClaw Coding Workbench

Use the Codex-owned `openclaw_repo_workbench` MCP as the normal read-heavy
inspection surface. OpenClaw launches and observes; it does not call these
tools on Codex's behalf.

## Workflow

1. Identify the smallest decision-driving search/read set.
2. Batch independent discovery with `repo_search_many`, `repo_read_many`, and
   `repo_glob_many`.
3. Use `git_inspect_many` for outer workspace and nested `src/openclaw` state.
4. Use `lsp_hover_typescript`, `lsp_definition_typescript`, or
   `lsp_references_typescript` after likely TypeScript symbols are known.
5. Use shell for focused commands, tests, formatting, builds, or a concrete
   MCP limitation. Name the limitation before broad shell fallback.

In Code Mode, invoke the MCP through its exact
`tools.mcp__openclaw_repo_workbench__*` namespace. For example, use
`tools.mcp__openclaw_repo_workbench__repo_search_many`; do not infer a server
alias from the skill or plugin name. The short tool names above are display
labels for those exact methods. If the live argument schema is not already in
context, inspect the one matching `ALL_TOOLS` entry before the first call and
follow that declaration rather than guessing field names.

Do not use this read-only MCP as a validation runner or editing surface. Use
Codex-native edit, patch, and command tools after inspection.
