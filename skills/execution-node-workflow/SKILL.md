---
name: execution-node-workflow
description: Optional reference for node-bound OpenClaw coding work. Execution workers no longer load this as always-active bootstrap context; native agent docs and tool descriptions are the primary operating contract.
---

# Execution Node Workflow

This skill is an optional reference, not required bootstrap context.

The node worker goal is accepted, valid source edits followed by terminal
`node_finish`. Todo, source lookup, delegation, validation, and repair exist
only to serve that goal.

## Parent Editor Loop

1. Read the node assignment prompt.
2. Create or update native todo with exactly one current `in_progress` item.
   Todo items are deliverables, not tool activity. Use implementation, test,
   validation, repair, and finish items instead of read, inspect, search, or
   gather-context items.
3. Use bounded `read`, `grep`, or `glob` for exact local editor navigation when
   the path, symbol, phrase, or filename stem is already known.
4. Delegate to `execution-context-scout` only when location, callers, tests, or
   architecture are not known enough to patch.
5. Edit as soon as target files and patch shape are nameable.
6. Delegate validation to `execution-validation-scout` when commands, output,
   or failure diagnosis are needed.
7. Repair from known source when validation points to known files.
8. Call `node_finish` with outcome, changed files, validation evidence, and any
   blocker.

## Delegation Boundary

Context scouts return mechanical source evidence: source windows, file graph,
likely edit points with excerpts, misses, missing windows, and risks. They do
not decide edit readiness.

Validation scouts return commands, exit status, bounded output, diagnosis,
repair context, and residual risk. They do not edit or finish.

## Navigation Rule

Kimi is not a crawler, but it is a normal editor. Use direct bounded local tools
for exact lookup. Use scouts for open-ended mapping. Do not turn lookup into a
proof phase once the patch shape is visible.
