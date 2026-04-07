# Behavior Application

## Purpose

This spec is the canonical bridge between:

- retrieval selection
- family application posture
- prompt rendering
- the new behavior-profile layer

It replaces the old habit of letting prompt text carry too much of the actual
application policy.

## Current live posture

The six landed families already apply with distinct user-facing behavior:

- response style shapes replies
- project facts answer explicit factual asks
- workflow lessons and project rules remain guidance-only
- unmet needs remain recommendation-only
- recurring procedures remain suggestion-first and direct-use only on clear
  checklist asks

Those differences are valid product-policy differences and must remain.

## Problem being solved by flattening

Today, too much application logic is spread across:

- retrieval ranking
- prompt-section query instructions
- prompt rendering branches

That makes prompt text a hidden policy engine.

## Target architecture

Application should be split into four layers.

### 1. Application substrate

The behavior-profile layer builds a structured `BehaviorProfile` from:

- query intent
- ranked retrieval results
- family application policy from the registry

### 2. Family application posture

The registry declares one application mode for each family:

- `shape_reply`
- `direct_answer`
- `guidance_only`
- `recommendation_only`
- `suggestion_first`

### 3. Retrieval selection

The retrieval layer and behavior-profile layer together decide:

- which memories are selected
- which are suppressed
- why they were selected or suppressed

### 4. Prompt rendering

`prompt-section.ts` should render from the behavior profile. It should not
re-derive family policy locally.

## Family application posture

### Response style

- mode: `shape_reply`
- role: shape the style and structure of the answer
- non-goal: broad personality simulation

### Project facts

- mode: `direct_answer`
- role: answer scoped factual project asks
- non-goal: speculative project summaries

### Workflow lessons

- mode: `guidance_only`
- role: provide reusable operating guidance
- non-goal: direct tool execution

### Project rules

- mode: `guidance_only`
- role: provide named-project operating guidance
- non-goal: arbitrary new project-fact fields

### Unmet needs

- mode: `recommendation_only`
- role: surface remembered missing support or capability gaps
- non-goal: install, procurement, or approval action

### Recurring procedures

- mode: `suggestion_first`
- role: suggest known procedures, and only directly use them on clear checklist
  asks
- non-goal: silent procedure execution

## Retrieval selection rules

The behavior-profile layer must preserve:

- exact typed wins when a direct typed project fact is asked
- family-aligned direct named-project result shaping
- suppression of adjacent irrelevant project memories after a clear family
  winner
- response-style shaping without turning style memories into direct factual
  answers

## Prompt rendering rules

Prompt rendering should:

- consume selected/suppressed memory outputs from the behavior profile
- preserve family-specific posture wording
- keep memory attribution available for later repair and proof

Prompt rendering should not:

- choose the winning family by itself
- silently broaden retrieval
- silently change procedure posture

## What flattening will absorb

The flattening phase should move these responsibilities out of prompt text:

- family query selection
- family winner selection
- adjacent-family suppression
- application mode selection

## What remains intentionally family-specific

- application mode per family
- direct-use restrictions for procedures
- stricter truth posture for project facts
- bounded scope of response style

## Non-goals

- making every family apply the same way
- turning prompt rendering into a memory browser
- enabling advisory planning in the current phase
