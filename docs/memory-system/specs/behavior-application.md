# Behavior Application

## Purpose

This spec remains the canonical bridge between:

- retrieval
- application selection
- family posture
- prompt rendering

## Updated conclusion

The repo now has a prompt-facing application-selection layer.

That means:

- structural application selection is now live for the current durable-memory
  prompt boundary
- prompt rendering is now downstream of that selection artifact

It does not yet mean the full end-state is complete.

## Current live posture

The six landed families still apply with distinct user-facing behavior:

- response style shapes replies
- project facts answer explicit factual asks
- workflow lessons and project rules remain guidance-only
- unmet needs remain recommendation-only
- recurring procedures remain suggestion-first and direct-use only on clear
  checklist asks

Those differences remain valid.

## Remaining problem

Application policy is no longer mainly owned by prompt text.

The remaining gap is narrower:

- the current landed selection layer is still prompt-facing
- the final retrieval-fed per-memory-item application substrate still remains
- procedure redesign still sits between the current state and the final
  end-state
- the next hardening slice should make the layer more query-aware and more
  token-disciplined before any self-improving capture reevaluation

## Target architecture

The application-selection layer should become the runtime owner of:

- selected items
- suppressed items
- application modes
- reason codes
- rendering hints

Prompt rendering should remain a consumer.

That is now true for the prompt-facing durable-memory layer.

The next hardening work should improve this layer by:

- reducing broad static durable-memory narration
- making selection more query-aware and retrieval-fed
- preserving real application-mode differences while making prompt behavior
  cheaper

## Read with

- `/memory-system/specs/behavior-profile-layer`
- `/memory-system/specs/application-selection-layer`
- `/memory-system/specs/retrieval-and-routing-control-plane`
