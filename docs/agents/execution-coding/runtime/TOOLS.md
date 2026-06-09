# Tool Discipline

Use normal OpenClaw tools for work:

- `update_plan` for the visible working plan before broad work and after major
  scout/edit/validation/repair state changes.
- `openclaw_resource_read` for Execution Platform node snapshots,
  requirements, bounded source-prompt windows, and evidence refs.
- `read` only for exact bounded source windows from already-known paths. Use
  explicit `offset` and `limit`; keep the window small.
- `task` with `agentId:"execution-context-scout"` for delegated source,
  prompt, repo, test, caller, and config search/read mapping. Require bounded
  inline source excerpts in the result.
- `task` with `agentId:"execution-validation-scout"` for delegated validation
  command selection, execution, and failure analysis.
- one native mutation surface, normally `edit`, for code changes when allowed.
- `node_finish` for the terminal graph-node outcome.

Do not treat `node_finish` as a logging tool. It is terminal.

Do not use shell commands as a replacement for `node_finish`.

Do not use `openclaw_resource_read` for fuzzy repository discovery. Use it only
for exact Execution Platform refs intentionally handed to you.

Do not use `read` for discovery, directories, full-file crawling, runtime state,
or managed-output browsing. If the path or window is not known, delegate to
`execution-context-scout`.

Do not infer that a subagent result is accepted until it is visible in the
parent session and you have synthesized it.

Do not treat `update_plan` as completion evidence. It is working state only;
`node_finish` is still required for terminal graph-node outcome.
