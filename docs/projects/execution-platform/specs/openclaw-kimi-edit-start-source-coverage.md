---
summary: "Superseded proposal for Kimi edit-start variance that was replaced by OpenCode-style source-shaped tool output."
title: "OpenClaw Kimi Edit-Start Source Coverage"
---

# OpenClaw Kimi Edit-Start Source Coverage

## Status

Superseded.

The read-window coverage trimming and batch source lookup approach was removed.
It created the wrong model-visible contract: Kimi was told context had already
been acquired, but the provider turn could receive ledger/cache metadata instead
of the actual editable source lines. That made the context-acquisition loop more
likely, not less.

## Replacement Direction

The active direction is OpenCode-style source-shaped output:

- `read` returns the requested bounded source window as line-numbered source.
- `grep` returns concrete regex matches grouped by path with line numbers.
- `glob` returns concrete file paths.
- Oversized tool output is saved to a normal managed-output file path under
  `stateRoot`, and visible guidance tells the agent to use normal `Read`/`Grep`
  semantics on that saved file.
- Coverage ledgers, replay markers, and managed-output refs may exist as
  runtime metadata, but they must not replace source-shaped evidence in the
  model-visible path.

## Implementation Note

`source_context_batch` was also removed from the catalog/runtime surface for
execution work. Batching source lookup is not an OpenCode primitive and became
another abstraction layer between the editor model and the source it needed to
patch.

The governing specs for the replacement path are:

- [OpenClaw Native Tool Output Compaction OpenCode Parity](/projects/execution-platform/specs/openclaw-native-tool-output-compaction-opencode-parity)
- [OpenClaw Parent Editor Navigation OpenCode Parity](/projects/execution-platform/specs/openclaw-parent-editor-navigation-opencode-parity)
