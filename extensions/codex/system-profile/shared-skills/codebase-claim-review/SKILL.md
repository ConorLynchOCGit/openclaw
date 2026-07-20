---
name: codebase-claim-review
description: Use when reviewing a plan, research memo, implementation brief, or architecture recommendation that makes claims about repo behavior, source files, runtime paths, tool surfaces, tests, or implementation ownership. Checks that codebase claims are grounded in inspected files/symbols/docs rather than summaries or stale artifacts.
---

# Codebase Claim Review

Use this skill when reviewer evaluates any artifact that makes codebase,
runtime, config, tool, or implementation claims.

## Positive Patterns

Strong codebase claims include:

- exact file paths and symbols when the claim depends on implementation;
- bounded source facts instead of broad repo summaries;
- test or fixture refs when behavior is claimed as proven;
- current config or registry refs when furnishing/tool claims are made;
- explicit caveats when source inspection was deferred;
- separation between observed source truth and inference;
- implementation implications tied to concrete source locations.

## Negative Patterns

Require revision when the artifact:

- makes architecture or runtime claims without inspected files;
- cites task lists, progress summaries, or stale proof artifacts as source
  truth when current code/config is available;
- says "the code does X" without paths, symbols, or tests;
- relies on docs while source/config may contradict them;
- does broad repo-tour commentary instead of targeted source evidence;
- proposes implementation slices without identifying likely touched files;
- claims a prior fix exists without checking the current branch/runtime surface.
- turns `not found in one package/root` into a workspace-wide absence claim;
- accepts a negative existence claim from a search with incomplete coverage or
  without the relevant workspace/source roots and patterns;
- accepts an implementation-driving claim from a child summary without the
  parent reading the cited file/ref;
- omits `scout-reported` or `unverified` status when code/runtime refs were
  not directly inspected;
- uses a broad codebase scout as proof when a narrow owner-path inspection is
  required;
- skips the broad-vs-narrow codebase scout fixture when the work is about
  planning/codebase inspection quality.

## Review Moves

Ask:

- Which file/symbol/config entry proves this claim?
- Is this source truth, doc truth, transcript evidence, or inference?
- Did the planner inspect the ref directly or only receive a child summary?
- If not directly inspected, did the artifact downgrade the claim?
- Which tests would fail if this claim were wrong?
- Is the recommendation specific enough for an implementer to start work?
- Are there stale artifacts that could be misleading the plan?
- Does every `not found`, `unassigned`, or `does not exist` claim state the
  searched roots, patterns, and complete-versus-incomplete coverage?

## Bounded Verification

This skill does not turn Reviewer into a codebase scout. Start from the exact
implementation refs and owner-inspection ledger in the artifact. Independently
verify the highest-risk claim and a representative owner/test path whose
failure would change the review decision. Do not re-read every implementation
file merely because the plan is implementation-driving.

Require revision when the artifact has no exact source refs, records only
child-reported claims, or uses an incomplete search to support an absence
claim. If resolving the issue requires a broad owner search, return the exact
question for `codebase-researcher` and use `needs_more_research`; do not perform
the source tour inside Reviewer.

## Output

Return:

```markdown
## Verdict

## Unsupported Codebase Claims

- Claim:
  Missing source evidence:
  Required inspection:
  Impact on plan:

## Confirmed Source Truth

## Implementation Locations

## Required Revisions
```

For planning-quality, architecture, runtime, implementation, source-routing, or
execution-brief work, block when a material implementation-driving claim has
only child/scout-reported evidence and the artifact neither records direct
owner inspection nor downgrades the claim to `scout-reported` or `unverified`.
