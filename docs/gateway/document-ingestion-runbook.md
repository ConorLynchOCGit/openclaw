---
summary: "Operator runbook for read-only imported docs and deterministic long-document ingestion"
read_when:
  - Rolling out imported doc roots
  - Verifying long-document coverage
  - Troubleshooting document ingestion
title: "Document Ingestion Runbook"
---

# Document ingestion runbook

Use this runbook when you need to expose selected host-side docs inside the workspace and prove that long docs were fully read.

See also: [Document Ingestion](/gateway/document-ingestion).

## Document ingestion - accepted production baseline

Document ingestion is now an accepted production baseline.

Live state:

- controlled read-only imports into workspace are live
- `document_read` is the canonical long-doc ingestion path
- `document_read` is exposed in the main live tools profile and surface
- routine safe exec approval friction for normal main and builder gateway-host usage is removed

Accepted ingestion rule:

- full ingestion requires `authoritativeState = complete`
- and `coverage.complete = true`

Operator confirmation should also check:

- `verifiedFullHash = true`
- `fileStillMatchesFingerprint = true`

Canonical acceptance fixture:

- `.openclaw/document-ingestion-proof/fixtures/large.md`

Accepted-baseline freeze exists and is the rollback anchor for this feature.

## Feature summary

The accepted document-ingestion baseline has two layers:

1. Selected host-side document roots are exposed inside the workspace through narrow read-only imports.
2. Long documents are ingested through `document_read`, which fingerprints, chunks, tracks coverage, and verifies completeness before a full read can be claimed.

Read-only guarantees:

- imported roots are curated explicitly
- imported roots are read-only from the runtime’s perspective
- the canonical import health record is `workspace/imports/_metadata/document-imports-manifest.json`

Authoritative acceptance rule:

- a document is fully ingested only when:
  - `authoritativeState = complete`
  - `coverage.complete = true`

## Golden rule

- Long docs are not considered ingested until `document_read(action=verify)` reports complete coverage.
- Visibility is not ingestion.
- All chunks acquired is not yet verified completeness.

## Read policy

- Prefer `read` for workspace-visible files that fit under the adaptive ceiling.
- If `read` is capped or truncated, continue with paging or use `document_read` when deterministic coverage is required.
- Use `document_read` for files that exceed the adaptive ceiling or when proof-grade coverage is required.
- Do not use `exec` as the primary doc-ingestion path when a workspace file path exists.
- The small `150`-line chunk setting from the acceptance fixture is not the general production chunk size.
- Larger workspace `document_read` chunks are acceptable, but they should still stay materially below the adaptive `read` ceiling.

## Accepted state model

- `in_progress`
  - one or more expected chunks are still missing
- `ready_to_verify`
  - all expected chunks were acquired, but final verification has not run yet
- `complete`
  - verification passed and the document is fully ingested
- `incomplete`
  - the document read is explicitly incomplete
- `failed`
  - the session hit an explicit error and must be retried or restarted

Trust `authoritativeState` on current runs. Older pre-fix session artifacts can be misleading and should be treated as historical only.

## Required operator fields

For any important long-document read, check all of these:

- `authoritativeState`
- `expectedChunkCount`
- `acquiredChunkCount`
- `missingChunkIndexes`
- `coverage.complete`
- `verifiedFullHash`
- `fileStillMatchesFingerprint`

## Canonical surfaces

Identify these before making changes:

- live Compose file in use
- live config dir
- live workspace dir
- runtime container name
- imported source roots outside the normal workspace tree

Do not assume the host workspace placeholder path is the same thing as the runtime-visible imported path for a bind-mounted file.

## Accepted baseline freeze and live artifact policy

Accepted-baseline freezes live under:

- `/root/backups/document-ingestion-accepted-baseline-*`

Historical runtime session and proof clutter should be archived under:

- `/root/backups/document-ingestion-artifact-archive-*`

Live runtime paths should remain limited to:

- active `document_read` sessions needed now
- acceptance fixtures under `workspace/.openclaw/document-ingestion-proof/fixtures`
- the canonical import manifest

Do not leave old pre-fix or duplicate proof artifacts mixed into the active runtime tree.

## Import design

Imported roots are declared in `config/document-imports.json`.

Recommended workspace exposure:

- `workspace/imports/system_docs/<root>`

Current implementation expects:

- host-side source roots chosen explicitly
- read-only bind mounts into the runtime workspace
- manifest and health report in `workspace/imports/_metadata/document-imports-manifest.json`

## Safe rollout sequence

1. Take a backup of:
   - the Compose file in use
   - the Compose env file in use
   - the OpenClaw config dir
   - container inspect metadata
2. Create the workspace import placeholders:
   - `workspace/imports/system_docs`
   - `workspace/imports/_metadata`
3. Add only the required import env vars for the curated roots.
4. Re-render Compose and confirm the mounts are:
   - exactly the intended source paths
   - exactly the intended workspace targets
   - read-only
5. Rebuild the runtime image if the `document_read` implementation changed.
6. Recreate only the intended OpenClaw services.
7. Wait for health before running proof commands.

## Verification commands

### Import contract

Run:

```bash
node --import tsx scripts/document-imports-verify.ts
```

Expect:

- source exists
- runtime-visible imported path exists
- runtime-visible imported path is readable
- runtime-visible imported path is not writable from the runtime
- probe propagation succeeds for the dedicated probe import

Artifact:

- `workspace/imports/_metadata/document-imports-manifest.json`

### Coverage proof

Run:

```bash
node --import tsx scripts/document-ingestion-proof.ts
```

Expect proof cases for:

- small file complete
- repeated large-file complete
- long-line byte fallback
- mixed line endings
- file changed during read is detected as stale
- imported doc reports incomplete before full coverage
- imported doc reports complete only after all chunks are read and verified

Artifact:

- `workspace/.openclaw/document-ingestion-proof/report-<timestamp>.json`

## Routine acceptance test

Use `.openclaw/document-ingestion-proof/fixtures/large.md`.

Expected exact sequence:

1. start a fresh `document_read` session
2. acquire one chunk only
3. inspect status
   - expected:
     - `authoritativeState = in_progress`
     - `coverage.complete = false`
4. continue the same session until all chunks are acquired
5. inspect status again before verify
   - expected:
     - `authoritativeState = ready_to_verify`
     - `missingChunkIndexes = []`
     - `coverage.complete = false`
6. run `verify`
7. inspect final status
   - expected:
     - `authoritativeState = complete`
     - `coverage.complete = true`
     - `verifiedFullHash = true`
     - `fileStillMatchesFingerprint = true`

Operator prompt shape:

- start fresh session on `large.md`
- acquire exactly one chunk
- inspect status
- continue same session to completion
- inspect status before verify
- verify
- inspect final status

Do not accept a full read before the final verify step.

## What the manifest means

The import manifest records:

- source path
- workspace path
- host workspace placeholder path
- runtime-visible absolute path
- source stat
- runtime-visible imported stat
- read-only expectation
- write-failure result
- propagation result
- health

Interpretation rules:

- for bind-mounted file imports, the host workspace placeholder can be an empty placeholder file
- the runtime-visible imported path is the source of truth
- `health: ok` requires runtime readability, expected read-only behavior, and no propagation failure

## What the proof report means

The proof report records each case as:

- `passed`
- `failed`

For imported docs, the critical checks are:

- `imported-doc-incomplete-before-full-coverage`
- `imported-doc-complete-in-runtime`

Expected interpretation:

- incomplete means the guardrail worked
- complete means the runtime saw all expected chunks and verify passed

## Operator traps and anti-footgun notes

- visibility is not ingestion
- the imported file being readable does not mean it was fully ingested
- `allChunksAcquired = true` does not mean the document is accepted yet
- older pre-fix session artifacts may have mixed or transitional top-level status semantics
- trust `authoritativeState` on current runs
- if the host placeholder path and the runtime-visible imported path differ, the runtime-visible path is authoritative
- read-only imported roots are expected to reject writes; that is a safety property, not a bug

## Troubleshooting

### `document_read` does not appear in chat tools

Check:

- the agent uses the `coding` tools profile
- the live runtime was rebuilt after the `document_read` catalog exposure change
- the effective tool surface includes `document_read`

If needed:

- restart the affected OpenClaw services
- verify the effective tool surface before assuming the feature regressed

### Import exists on host but not in runtime

Check:

- Compose render
- active container mounts
- runtime-visible path inside the container

Do not trust only the host placeholder path.

### Imported file looks empty on host workspace

This can be expected for file bind targets.

Use:

- active container mounts
- runtime-visible path stat
- runtime-visible path hash

### Runtime cannot write document-read session state

Symptom:

- `EACCES` under `workspace/.openclaw/document-read`

Fix:

- make the document-ingestion state directories owned by the runtime UID
- do not broaden write access on the imported roots

### Bearer-auth HTTP tool invocation is blocked

That does not block this runbook.

The proof harness uses an in-container runtime invocation path for imported-doc cases.

### Imported docs are visible but not writable

That is expected.

Imported roots are intentionally read-only from the runtime’s perspective.

### Missing chunks

If `missingChunkIndexes` is non-empty:

- the document is not fully ingested
- continue the same session for the missing chunks only, or restart cleanly

### `coverage.complete` is false after all chunks were acquired

That is expected before `verify`.

If `authoritativeState = ready_to_verify` and `coverage.complete = false`, run `verify`. Do not summarize as a complete read yet.

### File changed during read

Expected behavior:

- `document_read` reports stale or fingerprint mismatch

Operator action:

- stop summarizing
- restart the session on the new file version

### Approval prompts returned unexpectedly

Check both layers:

- runtime `tools.exec.*`
- host-local `~/.openclaw/exec-approvals.json`

Routine main/builder gateway-host usage should stay at `ask = off`. If prompts return, a stricter runtime or host-local layer was reintroduced.

## Adding a new imported root safely

1. Add a new entry to `config/document-imports.json`.
2. Add exactly one env var for the source path.
3. Add exactly one read-only bind mount target.
4. Re-render Compose and inspect the resulting mount list.
5. Rerun the import verifier.
6. If long-doc ingestion matters for that root, add a proof case or operator test that reads one representative long file.

Do not expose a broad parent directory just because it is convenient.

## Rollback

1. Identify the latest accepted baseline freeze under `/root/backups/document-ingestion-accepted-baseline-*`.
2. Restore from that freeze:
   - live config files
   - `docker-compose.yml` if needed
   - document import config
3. Recreate the affected OpenClaw services.
4. Confirm runtime health.
5. Verify:
   - `workspace/imports/_metadata/document-imports-manifest.json` exists and is readable
   - `document_read` is visible in the intended chat tool surface
   - the `large.md` routine acceptance test passes again
6. If live runtime state is noisy or misleading, archive it into a dated `document-ingestion-artifact-archive-*` directory before recreating fresh acceptance evidence.

## Shared operator checklist

- backup taken
- mount list rendered and inspected
- runtime healthy after recreate
- import verifier passed
- proof harness passed
- runtime-visible imported hash matches source hash for file imports
- incomplete imported-doc proof passed
- complete imported-doc proof passed
- rollback steps documented and ready
- accepted-baseline freeze captured
- stale pre-fix or duplicate artifacts archived out of the live runtime tree
