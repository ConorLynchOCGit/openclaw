# Premortem

## Purpose

This document lists the most likely ways the planning-to-implementation phase
can fail and how to catch those failures early.

## Failure modes

### 1. Spec sprawl

- detection:
  - too many overlapping docs
  - engineers unsure which spec is authoritative
- prevention:
  - keep `/memory-system/feature-inventory` canonical for status
  - keep `/memory-system/specs/README` canonical for navigation
- guardrail:
  - any new spec must be linked from both files

### 2. Duplicated logic across detector / parser / canonicalizer

- detection:
  - the same subject mapping rules appear in multiple places
- prevention:
  - treat detector as classification only
  - treat canonicalizer as normalization only
  - treat parser as high-confidence shortcut only
- guardrail:
  - architecture-fit review before coding each new family

### 3. Unclear precedence during behavior application

- detection:
  - overlapping memories produce inconsistent replies
- prevention:
  - define precedence in the behavior-application spec before coding
- guardrail:
  - overlap tests required before live rollout

### 4. Too much candidate noise

- detection:
  - candidate volume rises faster than useful approval or retrieval value
- prevention:
  - ambiguity policy must support abstain/clarify
- guardrail:
  - candidate-quality review is a gate for semantic-expansion slices

### 5. False positives from semantic detection

- detection:
  - review rejects a high fraction of semantically captured candidates
- prevention:
  - require messy-language eval with false-positive traps
- guardrail:
  - semantic slices do not advance without eval results

### 6. Insufficient user repair controls

- detection:
  - wrong memory is easy to create but hard to correct
- prevention:
  - build repair/control alongside behavior application
- guardrail:
  - no broad semantic rollout without repair flows for the target family

### 7. Roadmap / spec drift

- detection:
  - roadmap, inventory, and spec docs disagree on status
- prevention:
  - update all three together after each slice
- guardrail:
  - final slice closeout must update roadmap + inventory + relevant spec docs

### 8. Coding starts before eval gates exist

- detection:
  - implementation introduces broad heuristics without measurable coverage
- prevention:
  - require eval spec and corpus before semantic detector rollout
- guardrail:
  - do not merge semantic-detection slices without the eval lane

### 9. Pressure to enable automation too early

- detection:
  - implementation tries to jump from better capture to execution/procurement
- prevention:
  - keep automation phases later in the roadmap
- guardrail:
  - procurement/install remain recommendation-only or disabled until explicitly
    reauthorized

### 10. Production proofing happens too early again

- detection:
  - discovery/debugging work starts using production as the first proof surface
- prevention:
  - default to isolated proof environment
- guardrail:
  - no risky memory development on production before off-production proof is
    green

### 11. Confusion about what is already built vs not built

- detection:
  - people redesign already-existing surfaces or assume partial work is fully
    live
- prevention:
  - consult `/memory-system/feature-inventory` first
- guardrail:
  - inventory status must be updated whenever a family materially changes
