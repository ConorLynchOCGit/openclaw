---
name: openclaw-contributor-guidance
description: Resolve immutable generation-owned OpenClaw contributor guidance for the exact repository subtree being changed.
---

# OpenClaw Contributor Guidance

Use this capability before editing a subtree governed by a scoped `AGENTS.md`.

1. Read `index.json` from this directory.
2. Match the target repository-relative path to the deepest applicable scope.
3. Read only the corresponding immutable file under `tree/`.
4. Treat editable worktree copies as successor-release source, not current execution authority.
5. Include the applicable guidance ref in any child mission that owns files in that scope.

Do not load every scoped guide, infer a scope from filename similarity, or treat this index as an agent persona or workflow registry.
