# Production Semantic Retrieval Routing V5 Report

## Slice

Semantic retrieval routing v5 for approved `git_stash_unsafe` workflow
guidance.

## Scope

This rollout adds one more bounded approved workflow tool-gotcha lesson key to
live semantic retrieval routing:

- `git_stash_unsafe`

Locked posture remains:

- `memory_object_search_hybrid` stays the normal working-context path
- semantic routing remains approved-only and project-scoped
- strong typed hybrid matches still outrank semantic fallback
- candidate semantic retrieval remains disabled
- no autonomous remediation or workflow mutation was added

## Health before rollout

- proof gateway:
  - `http://127.0.0.1:37789/healthz` -> `{"ok":true,"status":"live"}`
- production gateway:
  - `http://127.0.0.1:28789/healthz` -> `{"ok":true,"status":"live"}`

## Rollback anchor

- `openclaw:pre-semantic-retrieval-routing-v5-20260406T212451Z`

## Isolated proof

Proof config:

- `config = /root/.openclaw-slice7-proof/openclaw.json`
- `env = /root/.openclaw-slice7-proof/.env`

Seeded proof context:

- `projectId = 792dd6f6-6d41-4bc8-8958-54a625ba74f2`
- `agentId = f0d3001c-f67b-487a-a938-b2a05e37a3f3`
- `sessionId = 764f6016-caa9-4b39-8d9d-64e0a4179e9a`
- `sessionKey = agent:f0d3001c-f67b-487a-a938-b2a05e37a3f3:proof-3671207f-1366-4b0f-bc7f-127efeb6b60c`

Proof turns:

1. `Do not use git stash in this repo during multi-agent work.`
2. `git stash is unsafe here because it can disturb concurrent work.`
3. exact-ish retrieval:
   - `git stash unsafe`
4. conceptual retrieval:
   - `can i temporarily shelve my changes while someone else edits this repo`

Captured proof evidence:

- `candidateId = e6a54148-7409-426a-868a-b9fee1b8f9e2`
- `candidateEventId = 2b9864f2-6259-40dd-bcae-2902da37e1c1`
- `approvedObjectId = 1b3d4f95-7a9e-45cd-bffb-b5068469f8f2`
- `reviewId = 21809e4e-52c3-48ea-81ed-ffa0fad69bfe`
- `embeddingId = 3cab1473-d456-4978-b37d-ceae951e4dd5`

Proof observations:

- first-seen evidence entered pending confirmation
- later confirming evidence auto-promoted the approved lesson
- approved source memory wrote one semantic embedding with:
  - `source = semantic_retrieval_routing_v5`
  - `family = workflow_tool_gotcha`
  - `lessonKey = git_stash_unsafe`
- loose stash-safety retrieval returned the approved object with:
  - `matchedFields = ["semantic_embedding", "semantic_fallback"]`
- no candidate semantic retrieval path was exposed

Notable proof nuance:

- one closer phrasing still surfaced lexical help first, which is acceptable
  under the hybrid-first posture
- the lower-noise conceptual phrasing above demonstrated the intended semantic
  fallback win cleanly

## Production proof

Production config:

- `config = /root/.openclaw/openclaw.json`
- `env = /root/.openclaw/.env`

Seeded production proof context:

- `projectId = 3b715f5d-4ca5-472d-a7c2-c6de06936878`
- `agentId = e7878b71-290b-4e17-a91d-9aa87a106e07`
- `sessionId = 1ff34ca9-b9db-48b6-b859-5fbd187d2080`
- `sessionKey = agent:e7878b71-290b-4e17-a91d-9aa87a106e07:prod-proof-bff10747-ea0a-4ddc-822d-67aba9820fca`

Production proof turns:

1. `Do not use git stash in this repo during multi-agent work.`
2. `git stash is unsafe here because it can disturb concurrent work.`
3. short stash-safety retrieval:
   - `git stash unsafe`
4. conceptual stash-safety retrieval:
   - `can i temporarily shelve my changes while someone else edits this repo`

Captured production evidence:

- `candidateId = dd93537b-ac26-4abe-a544-068b73124e26`
- `candidateEventId = 19fd2e89-4b07-4260-b1e4-9e9fa5b9d29f`
- `approvedObjectId = 284e9f91-366f-4ed8-8b1e-a4cc623b099f`
- `reviewId = ccb0394a-237c-40f2-a26b-eeb71cfa91b3`
- `embeddingId = 24b65709-e925-463b-ad33-0370cb53fc79`

Production observations:

- first-seen evidence entered pending confirmation
- later confirming evidence auto-promoted the approved lesson
- approved source memory wrote one semantic embedding with:
  - `source = semantic_retrieval_routing_v5`
  - `family = workflow_tool_gotcha`
  - `lessonKey = git_stash_unsafe`
- both the short stash-safety query and the looser conceptual stash-safety
  query returned the approved object with:
  - `matchedFields = ["semantic_embedding", "semantic_fallback"]`
- `pendingCount = 1` remained expected because the original pending candidate
  row remains as promotion source lineage while the approved durable object is
  separate
- no dead candidate backlog or duplicate confirming writes were introduced

## Health after rollout

- proof gateway:
  - `http://127.0.0.1:37789/healthz` -> `{"ok":true,"status":"live"}`
- production gateway:
  - `http://127.0.0.1:28789/healthz` -> `{"ok":true,"status":"live"}`

## What changed

- approved `git_stash_unsafe` workflow guidance now participates in the live
  bounded semantic fallback family for workflow tool gotchas
- the rollout remains narrow:
  - approved-only
  - project-scoped
  - hybrid-first for strong typed matches
  - no candidate semantic retrieval
  - no workflow automation

## What is still not live

- generic semantic search across memory families
- semantic retrieval for response-style memory
- semantic retrieval for explicit named project facts
- broader workflow-improvement semantic routing beyond the current approved
  bounded lesson set
- autonomous remediation or direct operational execution
