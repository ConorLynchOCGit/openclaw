# Feature Inventory

## Purpose

This inventory tracks:

- what the six landed families can already do
- what flattening genuinely accomplished
- what remains partial substrate versus finished substrate
- what must be fixed before self-improving capture and before new families

## Status classes

- `built_live`
  - live inside the accepted user-facing memory boundary
- `built_partial`
  - live enough to prove value, but not yet the final shared substrate shape
- `not_built`
  - no live implementation yet

## Landed family inventory

| Family                                  | Status       | Live now                                                                                                                                | Intentional differences that remain                                                             |
| --------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Response-style preference / requirement | `built_live` | bounded typed and generic response-style guidance, correction/supersede, reviewed phrase patterns, approved-only hybrid retrieval       | bounded scope, reply-shaping only, not broad personality memory                                 |
| Project facts                           | `built_live` | typed named-project facts, bounded generic named-project reference facts, explicit correction/supersede, approved-only hybrid retrieval | stricter truth posture, direct-answer application, project scope required                       |
| Recurring procedures                    | `built_live` | bounded recurring procedures and named checklists, validated-procedure retrieval, explicit correction/supersede                         | `suggestion_first`, direct-use only on clear checklist ask, validated artifact remains distinct |
| Workflow lessons                        | `built_live` | generalized workflow guidance capture, clustered auto-review, approved-only hybrid retrieval, phrase induction                          | guidance-only posture remains                                                                   |
| Project rules                           | `built_live` | generalized named-project operating guidance, clustered auto-review, approved-only hybrid retrieval                                     | project scope required, guidance-only posture remains                                           |
| Unmet needs                             | `built_live` | bounded named-project unmet-need capture, clustered auto-review, approved-only hybrid retrieval                                         | recommendation-only posture remains, conservative correction posture may remain                 |

## Substrate inventory

| Substrate seam                             | Status          | Current truth                                                                                                                               | Category          |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Family-definition registry                 | `built_partial` | six-family registry is live, but proof definitions, workflow-family mapping, semantic policy, and other control points are still duplicated | architecture debt |
| Unified ingestion resolver                 | `built_partial` | live for workflow lessons, project rules, and unmet needs only                                                                              | architecture debt |
| Unified clustered lifecycle                | `built_partial` | shared for several memory-object families; procedures still keep distinct staged handling                                                   | architecture debt |
| Unified correction / supersede             | `built_partial` | several bounded correction paths are shared, but policy is not fully declarative and still includes legacy gating                           | architecture debt |
| Unified phrase-pattern engine              | `built_partial` | one reviewed phrase substrate serves workflow lessons and response style; family eligibility remains intentionally narrow                   | architecture debt |
| Retrieval feature framework                | `built_partial` | shared score composition exists, but retrieval intent, suppression, semantic routing, and plan shaping are still split                      | architecture debt |
| Behavior-profile layer                     | `built_partial` | shared prompt-support layer exists, but it is not yet the real application-selection layer                                                  | architecture debt |
| Registry-driven proof inspection           | `built_partial` | proof-family definitions and shared helpers exist, but proofing is still registry-plus-switch rather than adapter-driven                    | architecture debt |
| Retrieval + semantic-routing control plane | `not_built`     | no single control plane yet covers intent, feature planning, suppression, and semantic fallback                                             | architecture debt |
| Application-selection / behavior planner   | `not_built`     | selected/suppressed memory attribution is not yet a runtime control plane                                                                   | architecture debt |
| Registry authority cleanup                 | `not_built`     | registry is not yet authoritative enough to be called the full control plane                                                                | architecture debt |
| Memory-family contract boundary cleanup    | `not_built`     | the family-policy boundary is still smellier than it should be                                                                              | architecture debt |

## Before reduced-profile self-improving capture

Required first:

1. full ingestion control-plane flattening
2. application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

## Before new families

Required first:

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

## Should fix soon

- stronger unit seams around retrieval intent, application selection, and
  semantic fallback
- reduced SQL scaffolding duplication between approved and candidate read
  surfaces
- replacement of remaining stringly control-flow with typed policy or adapter
  registration

## Could fix later

- deeper retrieval SQL normalization once the control plane is stronger
- tighter artifact / read-model convergence after the procedure redesign

## Deliberate policy differences versus backlog

Deliberate policy differences:

- procedures remain `suggestion_first`
- project facts remain explicit and stricter than guidance
- response style remains bounded
- unmet needs remain recommendation-only
- semantic routing remains family-gated
- phrase induction remains family-eligible, not universal

Backlog / flattening debt:

- ingestion still duplicated for response style, project facts, and recurring
  procedures
- application selection is still too prompt-driven
- retrieval intent and suppression are still split across multiple layers
- semantic routing is still a hardcoded sidecar subsystem
- recurring procedures still retain too much separate subsystem shape
- correction policy still includes legacy stringly/runtime-coupled gating
- proofing still scales through switches more than adapters

## Not live yet

Still not live:

- full post-v3 substrate control-plane flattening
- reduced-profile self-improving capture on top of the stronger substrate
- learned-guidance advisory planning
- new cross-domain families

## Read next

1. `/memory-system/POST_V3_ARCHITECTURE_REVIEW`
2. `/memory-system/CURRENT_SLICE`
3. `/memory-system/NEXT_SUBSTRATE_PUSH_PLAN`
4. `/memory-system/specs/implementation-sequencing`
