# Application And Token-Efficiency Hardening

## Landed status

Landed in pre-capture hardening batch v1.

What landed:

- a compact policy-shaped durable-memory prompt section
- lower ordinary-run prompt tax for durable-memory guidance
- structural family posture preserved while broad static narration was reduced

What did not land:

- a widened host contract for true retrieval-fed prompt shaping
- self-improving capture itself
- a generic prompt-system rewrite

## Purpose

Define the second post-v6 hardening slice that should land before any
reduced-profile self-improving capture reevaluation.

This slice exists to make the current durable-memory application layer cheaper
and more query-aware without erasing real family-policy differences.

## Why this slice is next

The post-v6 deep review concluded that the current application-selection layer
is structurally better than old prompt prose, but still too prompt-facing,
static, and token-heavy for added capture pressure.

The main issue is not that the layer is fake. The issue is that it is still too
tool-surface-driven and too broad in what it renders for ordinary runs.

## Runtime seams in scope

Primary likely touch points:

- `extensions/memory-core/src/behavior-profile.ts`
- `extensions/memory-core/src/prompt-section.ts`
- retrieval-to-application handoff seams that feed durable-memory shaping
- tests around behavior/application selection and prompt rendering

Secondary likely touch points:

- application-selection specs and prompt-facing docs
- any retrieval-fed selection helpers that already exist and can be reused

## Target architecture shape

The target shape is:

- application selection that is more query-aware and more retrieval-fed than
  the current tool-surface-driven prompt bridge
- prompt rendering that consumes smaller, more targeted guidance artifacts
  instead of broad static durable-memory narration
- explicit token-budget discipline for what durable-memory guidance gets
  rendered on a given run
- selected versus suppressed behavior that stays structural, but becomes
  cheaper and more context-sensitive

The target is not “no prompt guidance.” The target is “only enough prompt
guidance to change behavior for the current run.”

## Preserved family-policy differences

This slice must preserve:

- response style as bounded `shape_reply`
- project facts as stricter `direct_answer`
- workflow lessons and project rules as guidance-oriented
- unmet needs as recommendation-only
- procedures as `suggestion_first` and direct-use only on clear ask
- semantic routing as hybrid-first and family-gated

It must not flatten those application modes into one generic behavior surface.

## Success criteria

This slice is successful only if:

1. application selection is materially less tool-surface-driven
2. durable-memory prompt rendering is materially more conditional and targeted
3. the rendered memory block is cheaper in ordinary runs where broad guidance
   does not change behavior
4. selected/suppressed family posture remains structural and explicit
5. current application-mode semantics remain unchanged
6. targeted tests prove the cheaper prompt/application shape honestly

## Non-goals

This slice is not:

- self-improving capture itself
- a generic rewrite of the whole prompt system
- a collapse of real application-mode differences
- an excuse to move policy back into freeform prompt narration

## Risks

Main risks:

- reducing prompt guidance too aggressively and silently changing behavior
- keeping the same broad narration but merely wrapping it in a new interface
- pushing query-awareness into prompt prose instead of into the application
  substrate

## Validation expectations

At minimum this slice should prove:

- current family application modes remain intact
- prompt rendering remains downstream of structural selection
- the durable-memory section becomes more conditional or smaller where honest
- typed/runtime checks remain green

## What this slice unlocks next

This slice should make later self-improving capture reevaluation more honest
by reducing prompt tax and proving that the current memory substrate can scale
application behavior without turning memory growth into prompt bloat.
