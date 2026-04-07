# Feature Inventory

## Purpose

This inventory tracks:

- what the six landed families can already do
- what flattening-phase substrate work is now the highest priority
- which differences are architecture debt versus intentional family policy

## Status classes

- `built_live`
  - already part of the accepted live memory boundary
- `built_partial`
  - live enough to prove value, but not yet the final shared substrate shape
- `not_built`
  - no live implementation yet

## Landed family inventory

| Family                                  | Status       | Live now                                                                                                                                | Intentional differences that remain                                                                     |
| --------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Response-style preference / requirement | `built_live` | bounded typed and generic response-style guidance, correction/supersede, reviewed phrase patterns, approved-only hybrid retrieval       | bounded scope, reply-shaping only, not broad personality memory                                         |
| Project facts                           | `built_live` | typed named-project facts, bounded generic named-project reference facts, explicit correction/supersede, approved-only hybrid retrieval | stricter truth posture, direct-answer application, project scope required                               |
| Recurring procedures                    | `built_live` | bounded recurring procedures and named checklists, validated-procedure retrieval, explicit correction/supersede                         | `suggestion_first`, direct-use only on clear checklist ask, validated-procedure target remains distinct |
| Workflow lessons                        | `built_live` | generalized workflow guidance capture, clustered auto-review, approved-only hybrid retrieval, phrase induction                          | guidance-only posture remains                                                                           |
| Project rules                           | `built_live` | generalized named-project operating guidance, clustered auto-review, approved-only hybrid retrieval                                     | project scope required, guidance-only posture remains                                                   |
| Unmet needs                             | `built_live` | bounded named-project unmet-need capture, clustered auto-review, approved-only hybrid retrieval                                         | recommendation-only posture remains, conservative supersede posture may remain                          |

## Flattening-phase substrate inventory

| Substrate seam                   | Status          | Why it matters now                                                                                                               | Category          |
| -------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Family-definition registry       | `built_partial` | six-family registry is live, but more runtime seams still need to consume it                                                     | architecture debt |
| Unified ingestion resolver       | `built_partial` | workflow-family transcript and tool ingestion now share one resolver; other families still need migration                        | architecture debt |
| Unified clustered lifecycle      | `built_partial` | memory-object lifecycle inspection is shared for multiple families; correction and procedure-target paths still remain           | architecture debt |
| Unified correction / supersede   | `not_built`     | explicit correction targeting and supersede logic are still too family-specific                                                  | architecture debt |
| Unified phrase-pattern engine    | `not_built`     | phrase-capable families should not each own a local phrase subsystem                                                             | architecture debt |
| Retrieval feature framework      | `not_built`     | family-specific ranking logic in `db/queries.ts` will not scale                                                                  | architecture debt |
| Behavior-profile layer           | `not_built`     | prompt rendering still carries too much application policy                                                                       | architecture debt |
| Registry-driven proof inspection | `built_partial` | proof-runner now uses registry-defined inspection modes for the six main families, but proofing is not fully registry-driven yet | architecture debt |

## Deliberate policy differences versus backlog

Deliberate policy differences:

- procedures remain `suggestion_first`
- project facts remain explicit and stricter than guidance
- response style remains bounded
- semantic routing remains family-gated
- phrase induction remains family-eligible, not universal

Backlog / flattening debt:

- policy scattered across multiple runtime seams
- ingestion still duplicated for response style, project facts, and recurring
  procedures
- correction plumbing still duplicated by family
- growing family-specific retrieval scoring logic
- prompt-policy sprawl
- proof-runner still has remaining non-registry paths

## Not live yet

Still not live:

- later flattening slices after batch v1
- reduced-profile self-improving capture on top of the flattened substrate
- learned-guidance advisory planning
- new cross-domain families

## Read next

1. `/memory-system/CURRENT_SLICE`
2. `/memory-system/FAMILY_SUBSTRATE_FLATTENING_ANALYSIS`
3. `/memory-system/FLATTENING_EXECUTION_PLAN`
4. `/memory-system/specs/implementation-sequencing`
