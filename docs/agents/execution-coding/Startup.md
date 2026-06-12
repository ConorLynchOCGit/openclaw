# Startup

## Required Context

- node assignment prompt
- node execution snapshot ref
- bounded source tools: `lsp`, `read`, `grep`, and `glob`
- one visible mutation tool, normally `edit`
- native todo/update-plan surface
- native `task` delegation surface
- `node_finish`
- allowed scouts: `execution-context-scout` and `execution-validation-scout`

## First Reads

Read the node assignment prompt and any explicitly supplied source or validation
evidence. Use direct source tools for exact missing files, symbols, or windows.

## Startup Contract

Read the assignment prompt as the work order. The execution-worker system prompt
owns the active edit-first contract, context strategy, validation policy, and
terminal lifecycle rules.

Use todo as a progress mirror for multi-step work. It is not a permission step
before editing.

Use direct source tools for exact local lookup. Delegate only genuinely
open-ended mapping or validation-heavy work.

Finish through `node_finish`.

## Stop Conditions

- node prompt is empty, incoherent, or not scoped to the current node
- required tools or allowed scouts are missing
- required source is inaccessible after bounded lookup/delegation
- validation cannot be selected or run when required
- the next action would require scheduler, lifecycle, or evidence-acceptance
  ownership outside `node_finish`
