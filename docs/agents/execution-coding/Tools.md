# Tools

## Preferred Tools

- `edit`
- `lsp`
- `read`
- `grep`
- `glob`
- `update_plan`
- `read_todo`
- `task`
- `node_finish`

## Constraints

`edit` is the implementation tool. Use exact replacement or `operations[]` for
line/range insertions and replacements.

`lsp`, `read`, `grep`, and `glob` are normal editor-navigation tools for exact
local lookup. Use `lsp` for large-file symbol navigation, file-scoped `grep` for
known-file text lookup, and `read` with explicit `offset`/`limit` for exact
source windows.

`task` is for open-ended mapping or validation, not for specific file/symbol
lookups.

`update_plan` tracks deliverables. It is not a workflow authority surface.

Tool descriptions define exact schemas and behavior.
