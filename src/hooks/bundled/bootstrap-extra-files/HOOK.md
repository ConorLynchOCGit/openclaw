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
          "paths": ["packages/*/AGENTS.md", "packages/*/TOOLS.md"]
        }
      }
    }
  }
}
```

For per-agent contract packs, prefer putting the owned prompt pack directly on
the agent entry. The hook will read `agents.list[].contractPack` and
`agents.list[].runtimePromptFiles` during bootstrap:

```json
{
  "agents": {
    "list": [
      {
        "id": "planning",
        "contractPack": "docs/agents/planning",
        "runtimePromptFiles": ["AGENTS.md", "TOOLS.md", "IDENTITY.md", "SOUL.md", "USER.md"]
      },
      {
        "id": "reviewer",
        "contractPack": "docs/agents/reviewer",
        "runtimePromptFiles": ["AGENTS.md", "TOOLS.md"]
      }
    ]
  },
  "hooks": {
    "internal": {
      "entries": {
        "bootstrap-extra-files": {
          "enabled": true
        }
      }
    }
  }
}
```

Legacy agent-scoped extra files can still be configured on the hook when a
workspace cannot put prompt-pack ownership on the agent entry:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "bootstrap-extra-files": {
          "enabled": true,
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
- `agentPaths` / `agentPatterns` / `agentFiles` (object): map of
  `agentId -> string[]` patterns to append only for that agent. Prefer
  `agents.list[].contractPack` + `agents.list[].runtimePromptFiles` for new
  per-agent prompt packs.

All paths are resolved from the workspace and must stay inside it (including realpath checks).
Only recognized bootstrap basenames are loaded (`AGENTS.md`, `SOUL.md`, `TOOLS.md`,
`IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, `MEMORY.md`).
