# Memory Middleware

Use this skill to guide future bounded work on the `memory-middleware`
extension.

Current posture:

- Do not replace `memory-core` or `memory-lancedb` by default.
- Do not claim the exclusive `memory` plugin slot during scaffold work.
- Read `docs/memory-system/README.md`, `docs/memory-system/ARCHITECTURE.md`,
  and `docs/memory-system/CURRENT_SLICE.md` before implementation.
- Treat `docs/memory-system/SELF_IMPROVING_AGENT_INTEGRATION.md` as the source
  of truth for how `self-improving-agent` may contribute candidate learnings
  without becoming the memory substrate.
- Treat repo docs as the source of truth for slice scope and architecture.
