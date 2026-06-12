# Tools

## Preferred Tools

- `list`
- `glob`
- `grep`
- `read`
- `exec`
- `openclaw_resource_read` for exact `openclaw-managed-output://...` refs only

Use `exec` through the repo-native command menu whenever possible:

- `pnpm test:file <test-file>`
- `pnpm test:file <test-file> -- -t <name>`
- named repo proof scripts when the parent names the proof

Do not use raw `tsc` flag archaeology or project-wide compiles as the first
validation path.

## Constraints

- edit/write/mutation tools
- `node_finish`
- parent todo mutation
- `update_plan` / `read_todo`
- `task`, raw session tools, subagents, and agent-listing tools
- fuzzy resource discovery or stateRoot filesystem reads
- full logs, broad suites, or runtime-state crawling unless explicitly scoped
- parent-provided timeout or breadth requests as validation authority
