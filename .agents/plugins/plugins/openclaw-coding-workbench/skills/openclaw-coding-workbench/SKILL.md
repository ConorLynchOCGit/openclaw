---
name: openclaw-coding-workbench
description: Use when an OpenClaw-launched Codex Coding thread needs bounded, batched, read-only repository inspection before implementation. Prefer these tools over repeated one-off shell searches when multiple independent repo reads/searches are needed.
---

# OpenClaw Coding Workbench

This plugin belongs to the Codex execution thread, not the OpenClaw routing
agent. Use it only inside Codex-native Coding execution.

## Rules

- Use `repo_search_many` for multiple independent text searches.
- Use `repo_read_many` for multiple bounded file/range reads.
- Use `repo_glob_many` for multiple bounded file-pattern expansions.
- Use `git_inspect_many` for bounded status/diff/file-change inspection.
- Do not use these tools as validation runners.
- Do not mutate files with this plugin.
- Use Codex-native edit/patch/exec tools for implementation after inspection.
- Use Codex-native custom agents when task scope merits parallel research,
  implementation, or review.

## Boundary

OpenClaw launches, observes, mirrors, and receipts. Codex owns repository
inspection, editing, validation commands, and helper agents inside the Coding
thread.
