# Main Memory Tool Bypass Diagnosis Report V1

## 1. Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- starting head: `037fa8378f` `Memory: finalize advisory routing docs`
- starting tree: clean
- accepted starting claim to verify:
  Main was still bypassing memory tools on both workflow-preflight and direct
  lookup prompts after the advisory-routing fix

## 2. Slice contracts

### Slice 1

- tranche: transcript-backed root-cause diagnosis
- target:
  explain why the latest Main canary rerun used no memory tool for most tested
  prompts
- direct seams:
  - `~/.openclaw/openclaw.json`
  - `~/.openclaw/agents/main/sessions/**`
  - `extensions/memory-middleware/src/tools/registry.ts`
  - `extensions/memory-core/src/behavior-profile.ts`
  - `extensions/memory-core/src/prompt-section.ts`
  - `src/agents/pi-embedded-runner/**`
- preserve:
  no new families, no broader authority, no forced global memory use

### Slice 2

- tranche: narrow Main/OpenAI request-path follow-through
- target:
  land the smallest repo-owned fix for the memory-tool bypass
- direct seams:
  - `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
  - `src/agents/pi-embedded-runner/extra-params.ts`
  - `src/agents/pi-embedded-runner-extraparams.test.ts`
- preserve:
  approved-only learned-guidance, inline-only advisory, explicit rollout
  gating, retrieval-first direct lookup behavior, no global forced memory

### Slice 3

- tranche: post-diagnosis / post-fix repo-truth update
- target:
  update the memory docs/spec pack to say exactly what is fixed versus still
  unproven
- preserve:
  no optimistic claim without fresh transcript/tool evidence

## 3. Runtime seams changed

### Slice 1

No code changed. The slice narrowed the real control points:

- live rollout state for `memory_learned_guidance_plan`
- Main tool availability as shown in `systemPromptReport.tools.entries`
- Main OpenAI/Codex request path leaving memory-informed turns on
  `tool_choice: auto`

### Slice 2

- `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
  now extracts the latest user ask for Main, detects strong workflow-preflight
  versus direct workflow-lookup shapes, skips turns already inside a tool loop,
  and pins `tool_choice` to:
  - `memory_learned_guidance_plan` for eligible workflow-preflight prompts
    when that tool is available
  - `memory_object_search_hybrid` for strong direct lookup prompts
- `src/agents/pi-embedded-runner/extra-params.ts`
  now applies that wrapper only on the Main OpenAI/Codex path
- `src/agents/pi-embedded-runner-extraparams.test.ts`
  adds focused payload-mutation tests for:
  - Main workflow-preflight pinning
  - Main direct-lookup pinning
  - no pinning after tool-loop start
  - no pinning for non-Main agents

### Slice 3

Docs/spec truth only. No runtime seam widened.

## 4. Diagnosis / fix / judgment decisions landed

### Slice 1 diagnosis

The latest Main rerun was a mixed failure, not a single bug.

Confirmed transcript/tool state:

- `memory_learned_guidance_plan`: 0 calls
- `memory_object_search_hybrid`: 1 call
- `memory_search`: 0 calls
- most tested prompts: no memory tool call

Confirmed control points:

1. learned-guidance was unavailable in the live rerun

- `~/.openclaw/openclaw.json` did not enable
  `learnedGuidanceAdvisoryPlanning.rolloutTarget`
- `~/.openclaw/agents/main/sessions/sessions.json` showed Main tool entries
  without `memory_learned_guidance_plan`

2. retrieval tools were available but still bypassed

- Main tool entries still included `memory_object_search_hybrid`
- prompt/profile guidance already existed
- the Main OpenAI/Codex path still sent requests on `tool_choice: auto`
  and relied on prompt prose alone

Slice 1 judgment:

- mixed diagnosis:
  - live rollout-state / tool-availability gap for learned-guidance
  - Main planner/tool-calling gap for available retrieval tools

### Slice 2 judgment

- result: partially fixed

Why partially:

- the repo-owned Main/OpenAI control point is now fixed narrowly
- the patch does not broaden authority or force all prompts through memory
- but Main memory-tool behavior is still not canary-proven without a fresh live
  rerun transcript

### Slice 3 judgment

- current truthful state:
  - learned-guidance remains bounded and default-off unless explicitly enabled
  - Main now has bounded tool-choice steering for strong prompt classes
  - live Main production-canary proof is still missing

## 5. Behavior preserved

- no new memory families
- no change to self-improving approval authority
- no change to learned-guidance execution authority
- no change to retrieval/application family-policy differences
- no global forced memory behavior
- no pinning once a tool loop is already underway
- no non-Main agent widening

## 6. Tests and validation run at the end of each executed slice

### Slice 1

Validation commands:

- `git status --short --branch`
- `git log --oneline -1`
- `rg -n '366178bb-9da5-44b9-b659-76aecfccb4e1|memory_learned_guidance_plan|memory_object_search_hybrid' ~/.openclaw/agents/main/sessions -g '*.json' -g '*.jsonl'`
- `rg -n 'learnedGuidanceAdvisoryPlanning|selfImprovingCapture|memory-middleware' ~/.openclaw/openclaw.json`
- `rg -n 'tool_choice|onPayload|memory_learned_guidance_plan|memory_object_search_hybrid' src node_modules/@mariozechner/pi-ai/dist -g '*.ts' -g '*.js'`

Result:

- diagnosis confirmed from live config, live session metadata, transcript logs,
  and code references

### Slice 2

Validation commands:

- `pnpm test -- src/agents/pi-embedded-runner-extraparams.test.ts -t "pins learned-guidance tool choice for Main workflow-preflight prompts|pins hybrid retrieval for Main direct workflow lookup prompts|does not pin memory tool choice after tool loop activity has already started|does not pin memory tool choice for non-main agents"`
- `pnpm check:types`

Result:

- targeted tests passed
- typecheck passed

### Slice 3

Validation deferred to final landing bar after docs/report completion.

## 7. Remaining work after this batch

- rerun Main production-canary with learned-guidance actually enabled in live
  rollout config
- capture fresh transcript/tool evidence for:
  - workflow-preflight advisory selection
  - direct lookup retrieval selection
  - any remaining no-memory bypass prompts
- judge whether the docs/file/native-workflow weak spots are still acceptable
  under the rerun

## 8. Exact next implementation slice recommended

The next slice should be:

- a fresh narrow rollbackable Main production-canary rerun with:
  - learned-guidance rollout target explicitly enabled
  - workflow-preflight prompts that should hit
    `memory_learned_guidance_plan`
  - strong direct lookup prompts that should hit
    `memory_object_search_hybrid`
  - explicit watch items for docs-localization ranking/metadata,
    file-reference retrieval, and native workflow guidance retrieval

Why this is next:

- the current repo-owned bypass lever is now fixed
- the last failed rerun mixed a live enablement gap with direct tool bypass
- the next missing truth is fresh live transcript/tool evidence, not more
  architecture churn
