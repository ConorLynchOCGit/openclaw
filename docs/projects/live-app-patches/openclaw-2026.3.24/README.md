# OpenClaw 2026.3.24 Local Patch Durability

Purpose: patch-only durability for live OpenClaw local overrides.

Source live repo path: `/root/services/openclaw-upgrade-2026.3.24`

Upstream base tag: `v2026.3.24`

Upstream base commit: `cff6dc94e30794a269eb7805b6e636c3634a088c`

Preserved artifacts:

- `ui/src/ui/app-render.helpers.ts` override
- `Dockerfile.browser`

Why these are preserved:

- The UI override forces the canonical main session key `agent:main:main` to render as `Main Session` even when stale metadata still reports `heartbeat`.
- `Dockerfile.browser` preserves a local browser-image recipe that installs Chromium into `/ms-playwright` and keeps the runtime path stable for browser sandbox usage.

Reapply guidance for a future upgrade cycle:

1. Upgrade the live app repo to the target upstream tag or commit.
2. Review whether `ui/src/ui/app-render.helpers.ts` still needs the `Main Session` override or whether upstream behavior now covers it.
3. Apply `ui-src-ui-app-render.helpers.ts.patch` with `git apply` or port the same logic manually if the file moved.
4. Restore `Dockerfile.browser` if the upgraded repo still needs a separate browser image build path.
5. Validate behavior before carrying the patch bundle forward to the next versioned directory.
