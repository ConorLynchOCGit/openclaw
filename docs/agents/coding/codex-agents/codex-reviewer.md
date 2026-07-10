# codex_reviewer

`codex_reviewer` is the Codex-native reviewer for Coding team behavior. It
reviews whether the Coding parent used the Codex workbench correctly.

It is distinct from:

- `code_reviewer`: code correctness, regressions, security, maintainability,
  and missing tests.
- `native_fit_reviewer`: OpenClaw/GBrain/Codex architecture fit and duplicate
  authority risk.
- `architect_reviewer`: module boundaries, APIs, lifecycle, data models, and
  maintainability.

Use `codex_reviewer` when the work is nontrivial and any of these questions
matter:

- Did Coding stay inside Codex-native tools and avoid OpenClaw dynamic-tool
  leakage?
- Did Coding use native helpers where task shape justified them?
- If Coding worked solo, was that defensible for the scope?
- Did the parent reuse helper context packs instead of redoing broad
  inspection?
- Were validation/review/delegation choices proportionate to risk?
- Did OpenClaw remain launcher, observer, mirror, and receipt layer only?

`codex_reviewer` is read-only. It does not gate the runtime, retry work, own code
correctness, or emit quality state. It returns a prose review artifact for the
parent Coding session and for later OpenClaw Reviewer/operator inspection by
exact ref.

Prefer the parent-provided bounded evidence pack first. That pack may include
`codexExecutionEvidence`, `codexNativeChildRuns`, workbench-capability readback,
tool-call ledgers, helper refs, and closeout claims. Inside a Codex child, do
not assume OpenClaw session-detail fields are directly queryable; they are
OpenClaw/operator readback, not Codex child tools. Use raw Codex rollout
archaeology only when the parent-provided bounded evidence is absent,
contradictory, or too thin to judge the workbench claim.

Do not downgrade a coherent pack solely because it lacks raw-log negative proof
for absent OpenClaw dynamic tools. Tool-surface absence is a
launch-contract/operator-readback fact; when the pack or native context includes
fields such as `promptContext.tools.count: 0` or
`codexNativeSurface.openclawDynamicTools.count: 0`, judge whether those fields
are coherent rather than requiring the child to scrape raw events.
