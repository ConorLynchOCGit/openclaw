# Model Memory Production Cutover Day 0 Verification

- Executed at: `2026-04-15T22:46:56Z`
- Runtime: live Docker Compose gateway on `openclaw-runtime`
- Config posture:
  - `plugins.entries.model-memory.enabled = true`
  - `plugins.entries.model-memory.config.live.enabled = true`
  - `plugins.entries.model-memory.config.database.url` configured
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`

## Verification summary

- `openclaw status` shows:
  - `Model memory = enabled`
  - `db = postgres`
  - `capture = on`
  - `context = on`
  - `legacy slot = off`
  - `legacy search = off`
- `status --json` shows:
  - `modelMemoryRuntime.enabled = true`
  - `modelMemoryRuntime.databaseConfigured = true`
  - `modelMemoryRuntime.captureWritesEnabled = true`
  - `modelMemoryRuntime.contextInjectionEnabled = true`
  - `modelMemoryRuntime.legacyMemorySlotDisabled = true`
  - `modelMemoryRuntime.legacyMemorySearchDisabled = true`
  - `memoryPlugin.enabled = false`
- rebuilt image deployed:
  - `openclaw:local sha256:e9009cdf937f75b5ff585c7b77e3e6c25e4d39607bc90c3887d8f510a4370b72`
- startup logs no longer contain:
  - `model-memory live runtime warmup failed`

## Known non-cutover warnings

- stale config entries still warn for:
  - `brave`
  - `firecrawl`
  - `browser`
  - `memory-middleware`
- startup still reports one unrelated session cleanup permission warning for:
  - `/home/node/.openclaw/agents/researcher/sessions`

Those warnings did not block the cutover flip, but they should be cleaned up
separately.
