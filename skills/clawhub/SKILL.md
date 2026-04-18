---
name: clawhub
description: Use native OpenClaw skills commands or the ClawHub CLI to search, install, update, publish, or quarantine-review marketplace skills. Use when you need skill discovery, trusted workspace install/update, or quarantine-only third-party acquisition before review.
metadata:
  {
    "openclaw":
      {
        "requires": { "anyBins": ["openclaw", "clawhub"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "clawhub",
              "bins": ["clawhub"],
              "label": "Install ClawHub CLI (npm)",
            },
          ],
      },
  }
---

# ClawHub

Use native OpenClaw skill commands when you are working with trusted search,
install, and update flows inside the active workspace.

Use the separate `clawhub` CLI when you need:

- publish or sync
- registry auth
- quarantine-only acquisition into a temporary review workspace

## Install the CLI if needed

```bash
npm i -g clawhub
```

## Native OpenClaw search / install / update

```bash
openclaw skills search "postgres backups"
openclaw skills install my-skill
openclaw skills install my-skill --version 1.2.3
openclaw skills update --all
```

## ClawHub CLI auth / publish

```bash
clawhub login
clawhub whoami
clawhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

## ClawHub CLI search / install / update

```bash
clawhub search "postgres backups"
clawhub install my-skill
clawhub install my-skill --version 1.2.3
clawhub update my-skill
clawhub update my-skill --version 1.2.3
clawhub update --all
clawhub update my-skill --force
clawhub update --all --no-input --force
```

List

```bash
clawhub list
```

## Quarantine review acquisition

```bash
TMPROOT="$(mktemp -d /tmp/openclaw-skill-vetting.XXXXXX)"
clawhub install my-skill --workdir "$TMPROOT" --dir skills --no-input
```

Do not use `openclaw skills install` for first-pass review of an untrusted
skill. That writes into the active workspace rather than quarantine.

## Notes

- Default registry: https://clawhub.com (override with CLAWHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to OpenClaw workspace); install dir: ./skills (override with --workdir / --dir / CLAWHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
- If only native `openclaw` search/install is available, treat that as trusted
  workspace management, not quarantine review
