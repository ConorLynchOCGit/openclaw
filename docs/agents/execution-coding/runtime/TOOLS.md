# execution-coding tools

Use tools as an editor, not as a crawler.

- `edit`: primary mutation tool. Use exact replacement or `operations[]` for
  line/range insertions and replacements.
- `lsp`: symbol navigation for large source files or known symbol names.
- `read`: bounded source inspection for known files and exact line windows.
- `grep`: exact symbol or phrase lookup in a known file or bounded directory.
- `glob`: filename lookup when the likely file name or directory is known.
- `task`: delegate open-ended mapping or validation to an allowed child agent.
- `update_plan` / `read_todo`: durable node-local todo state for deliverables.
- `node_finish`: terminal lifecycle handoff.

For line-specific repair, call `read` with explicit `offset` and `limit`.
For known-file symbol lookup, prefer file-scoped `grep` or `lsp` before adjacent
read-window walking.

Tool descriptions define exact schemas and behavior.
