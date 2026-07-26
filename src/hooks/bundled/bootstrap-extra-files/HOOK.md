---
name: bootstrap-extra-files
description: "Inject additional workspace bootstrap files via glob/path patterns"
homepage: https://docs.openclaw.ai/automation/hooks#bootstrap-extra-files
metadata:
  {
    "openclaw":
      {
        "emoji": "📎",
        "events": ["agent:bootstrap"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Bootstrap Extra Files Hook

Loads additional bootstrap files into `Project Context` during `agent:bootstrap`.

## Why

Use this when your workspace has multiple context roots (for example monorepos) and
you want to include extra `AGENTS.md`/`TOOLS.md`-class files without changing the
workspace root.

## Configuration

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "bootstrap-extra-files": {
          "enabled": true,
          "paths": ["packages/*/AGENTS.md", "packages/*/TOOLS.md"],
          "agentPaths": {
            "planning": ["docs/agents/planning/AGENTS.md", "docs/agents/planning/TOOLS.md"],
            "reviewer": ["docs/agents/reviewer/AGENTS.md", "docs/agents/reviewer/TOOLS.md"]
          }
        }
      }
    }
  }
}
```

## Options

- `paths` (string[]): preferred list of glob/path patterns.
- `patterns` (string[]): alias of `paths`.
- `files` (string[]): alias of `paths`.
- `agentPaths`, `agentPatterns`, or `agentFiles` (object): patterns keyed by agent ID.

All paths are resolved from the workspace and must stay inside it (including realpath checks).
Only recognized bootstrap basenames are loaded (`AGENTS.md`, `SOUL.md`, `TOOLS.md`,
`IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, `MEMORY.md`).
