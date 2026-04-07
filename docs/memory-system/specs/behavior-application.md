# Behavior Application

## Purpose

This spec remains the canonical bridge between:

- retrieval
- application selection
- family posture
- prompt rendering

## Updated conclusion

The repo now accepts that the currently landed behavior-profile layer improved
prompt support but did not yet complete application architecture.

The correct target is:

- structural application selection first
- prompt rendering second

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

Application policy is still too split across:

- retrieval intent shaping
- post-query suppression
- prompt guidance

That means prompt text is no longer the only policy source, but it is still too
close to the decision path.

## Target architecture

The application-selection layer should become the runtime owner of:

- selected items
- suppressed items
- application modes
- reason codes
- rendering hints

Prompt rendering should remain a consumer.

## Read with

- `/memory-system/specs/behavior-profile-layer`
- `/memory-system/specs/application-selection-layer`
- `/memory-system/specs/retrieval-and-routing-control-plane`
