# Main Reminder Isolation And Memory Consolidation Report V1

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- starting head:
  `d888efffeea5b0d0620c5320ae067845747279c6`
- starting truth:
  - the bounded rollout-proof and reevaluation batch was landed
  - manual Main-session UX testing had confirmed:
    - no-prefix memory submission was real
    - explicit natural wording worked better than vague wording
    - commit/test workflow retrieval was already strong
    - docs-workflow clustering and ranking was still messy
    - file-formatting memory was usable but still candidate-heavy
    - an internal daily operator reminder leaked visibly into Main chat

## Contracts chosen for slices 1-3

### Slice 1 — Main-session reminder isolation

- fix the real reminder leak structurally
- preserve internal reminder execution
- avoid string-based transcript hiding

### Slice 2 — docs and formatting memory consolidation

- add a bounded project-rule semantic path for explicit docs-localization
  policy phrasing
- add a bounded generalized response-style path for explicit file-reference
  preferences
- add retrieval hinting so strong canonical memories beat weaker nearby
  variants more consistently
- preserve project-rule versus workflow and response-style versus project
  guidance differences

### Slice 3 — bounded rollout follow-through

- decide what should now be eligible for bounded promotion follow-through
- decide what should stay narrow
- update the docs pack to reflect the new truth

## Runtime seams changed per executed slice

### Slice 1

- `src/infra/heartbeat-runner.ts`
- `src/infra/heartbeat-runner.ghost-reminder.test.ts`

### Slice 2

- `extensions/memory-middleware/src/response-style-semantic.ts`
- `extensions/memory-middleware/src/project-rule-semantic.ts`
- `extensions/memory-middleware/src/retrieval-intent.ts`
- `extensions/memory-middleware/src/retrieval-feature-framework.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-middleware/src/response-style-semantic.test.ts`
- `extensions/memory-middleware/src/retrieval-intent.test.ts`
- `extensions/memory-middleware/src/memory-ingestion-resolver.test.ts`
- `extensions/memory-middleware/src/retrieval-feature-framework.test.ts`

### Slice 3

- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/NEXT_SUBSTRATE_PUSH_PLAN.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/specs/implementation-sequencing.md`
- `docs/memory-system/specs/self-improving-capture-integration.md`
- `docs/memory-system/specs/learned-guidance-advisory-planning.md`

## Reminder-isolation, consolidation, and rollout decisions landed

### Slice 1

- internal-only cron / exec reminder turns now isolate onto the heartbeat
  session instead of Main
- Main no longer needs to display the raw reminder payload for internal
  reminder execution to proceed

### Slice 2

- explicit docs-localization policy phrasing with project scope now resolves as
  project-rule guidance
- docs i18n / translation / `docs/zh-CN` rule queries now classify more
  coherently toward project-rule retrieval
- explicit file-reference preferences now resolve as bounded generalized
  response-style guidance under the `file references` subject
- file-reference retrieval now has subject-hint support so the stronger
  canonical preference can outrank weaker nearby variants

### Slice 3

- explicit docs-localization packet shapes are now eligible for bounded
  promotion follow-through
- explicit file-reference response-style packet shapes are now eligible for
  bounded promotion follow-through
- vague shorthand docs/file packet shapes still stay narrow and
  candidate-heavy
- self-improving capture and learned-guidance advisory planning still stay
  narrow; this batch did not widen them

## Behavior preserved per executed slice

### Slice 1

- normal user prompts still render in Main
- normal assistant replies still render in Main
- internal reminder execution still receives its execution context

### Slice 2

- project-rule and workflow-improvement families remain distinct
- response-style and project-guidance families remain distinct
- vague shorthand phrasing is not auto-upgraded into strong canonical memory
- bounded retrieval behavior remains approved-first and family-aware

### Slice 3

- no new family widening was claimed or enabled
- no self-improving authority or advisory authority was broadened
- the docs pack now reflects promotion follow-through before broader widening

## Tests and validation run at the end of each executed slice

### Slice 1

- `pnpm test -- src/infra/heartbeat-runner.ghost-reminder.test.ts src/infra/heartbeat-runner.model-override.test.ts -t "internal-only|actionable cron event exists|isolated session key"`
- `pnpm test -- src/gateway/server.chat.gateway-server-chat.test.ts -t "chat.history hides assistant NO_REPLY-only entries"`
- `pnpm check:types`

### Slice 2

- `pnpm test -- extensions/memory-middleware/src/response-style-semantic.test.ts extensions/memory-middleware/src/retrieval-intent.test.ts extensions/memory-middleware/src/memory-ingestion-resolver.test.ts extensions/memory-middleware/src/retrieval-feature-framework.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts -t "file references|docs localization|retrieval intent helpers|retrieval-feature-framework|detectResponseStyleSemanticDecision"`
- `pnpm check:types`

### Slice 3

- doc-pack consistency review across roadmap, status, current-slice, and spec
  surfaces
- final landing validation recorded separately below

## Remaining work after this batch

- bounded promotion follow-through for the strongest explicit docs-localization
  and file-reference packet shapes
- bounded off-production rollout enablement on top of the cleaned Main-session
  boundary
- evidence review on usefulness, replay noise, conflict suppression, and
  prompt cost
- later widen / stay-narrow / pause decisions based on that evidence

## Next implementation slice recommended

- bounded promotion follow-through and off-production rollout enablement for
  the strongest explicit manual-UX-backed docs/file packet shapes plus the
  already-bounded self-improving and inline-advisory seams
