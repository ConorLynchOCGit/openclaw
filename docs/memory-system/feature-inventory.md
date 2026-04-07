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

| Substrate seam                   | Status      | Why it matters now                                                              | Category          |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------- | ----------------- |
| Family-definition registry       | `not_built` | family policy is still scattered across runtime seams                           | architecture debt |
| Unified ingestion resolver       | `not_built` | transcript and tool-side capture still resolve families separately              | architecture debt |
| Unified clustered lifecycle      | `not_built` | clustered lifecycle behavior is still partly reimplemented by family            | architecture debt |
| Unified correction / supersede   | `not_built` | explicit correction targeting and supersede logic are still too family-specific | architecture debt |
| Unified phrase-pattern engine    | `not_built` | phrase-capable families should not each own a local phrase subsystem            | architecture debt |
| Retrieval feature framework      | `not_built` | family-specific ranking logic in `db/queries.ts` will not scale                 | architecture debt |
| Behavior-profile layer           | `not_built` | prompt rendering still carries too much application policy                      | architecture debt |
| Registry-driven proof inspection | `not_built` | proof-runner family switches will grow with each new family                     | architecture debt |

## Deliberate policy differences versus backlog

Deliberate policy differences:

- procedures remain `suggestion_first`
- project facts remain explicit and stricter than guidance
- response style remains bounded
- semantic routing remains family-gated
- phrase induction remains family-eligible, not universal

Backlog / flattening debt:

- policy scattered across multiple runtime seams
- duplicated ingestion resolution
- duplicated lifecycle and correction plumbing
- growing family-specific retrieval scoring logic
- prompt-policy sprawl
- proof-runner family switches

## Not live yet

Still not live:

- flattened family substrate implementation
- reduced-profile self-improving capture on top of the flattened substrate
- learned-guidance advisory planning
- new cross-domain families

## Read next

1. `/memory-system/CURRENT_SLICE`
2. `/memory-system/FAMILY_SUBSTRATE_FLATTENING_ANALYSIS`
3. `/memory-system/FLATTENING_EXECUTION_PLAN`
4. `/memory-system/specs/implementation-sequencing`
