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

| Family                                  | Status       | Live now                                                                                                                                                 | Intentional differences that remain                                                             |
| --------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Response-style preference / requirement | `built_live` | bounded typed and generic response-style guidance, correction/supersede, reviewed phrase patterns, approved-only hybrid retrieval                        | bounded scope, reply-shaping only, not broad personality memory                                 |
| Project facts                           | `built_live` | typed named-project facts, bounded generic named-project reference facts, explicit correction/supersede, approved-only hybrid retrieval                  | stricter truth posture, direct-answer application, project scope required                       |
| Recurring procedures                    | `built_live` | bounded recurring procedures and named checklists, explicit candidate -> validated staging, validated-procedure retrieval, explicit correction/supersede | `suggestion_first`, direct-use only on clear checklist ask, validated artifact remains distinct |
| Workflow lessons                        | `built_live` | generalized workflow guidance capture, clustered auto-review, approved-only hybrid retrieval, phrase induction                                           | guidance-only posture remains                                                                   |
| Project rules                           | `built_live` | generalized named-project operating guidance, clustered auto-review, approved-only hybrid retrieval                                                      | project scope required, guidance-only posture remains                                           |
| Unmet needs                             | `built_live` | bounded named-project unmet-need capture, clustered auto-review, approved-only hybrid retrieval                                                          | recommendation-only posture remains, conservative correction posture may remain                 |

## Substrate inventory

| Substrate seam                             | Status          | Current truth                                                                                                                                           | Category          |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Family-definition registry                 | `built_partial` | six-family registry is live, but proof definitions, workflow-family mapping, semantic policy, and other control points are still duplicated             | architecture debt |
| Unified ingestion resolver                 | `built_live`    | all six landed families now resolve through one shared ingestion substrate across transcript and tool submission, with family adapters preserved        | architecture debt |
| Unified clustered lifecycle                | `built_partial` | shared for several memory-object families, and procedures now share explicit staged transition handling even though validated artifacts remain distinct | architecture debt |
| Unified correction / supersede             | `built_live`    | declarative correction plans now own execution kind, target kind, and held-versus-immediate posture for the current families                            | architecture debt |
| Unified phrase-pattern engine              | `built_partial` | one reviewed phrase substrate serves workflow lessons and response style; family eligibility remains intentionally narrow                               | architecture debt |
| Retrieval feature framework                | `built_partial` | shared score composition exists, but deeper retrieval normalization still remains                                                                       | architecture debt |
| Behavior-profile bridge                    | `built_partial` | shared prompt-support bridge remains live and now feeds the structured prompt-facing application layer                                                  | architecture debt |
| Application-selection / behavior planner   | `built_partial` | selected/suppressed family guidance plus rendering hints are now structural for the prompt-facing durable-memory layer                                  | architecture debt |
| Retrieval + semantic-routing control plane | `built_partial` | hybrid retrieval now shares normalized control decisions for hints, project-family shaping, and semantic fallback family routing                        | architecture debt |
| Registry-driven proof inspection           | `built_partial` | registered lifecycle/artifact adapters now drive proof dispatch, but registry authority is still not the final proof control plane                      | architecture debt |
| Memory testability hardening               | `built_partial` | retrieval intent, prompt-facing application planning, and semantic fallback eligibility now have real unit seams                                        | supporting seam   |
| Hybrid memory-surface SQL scaffolding      | `built_partial` | approved and reviewable-candidate hybrid memory-object search shares one surface scaffold, but broader retrieval normalization still remains            | supporting seam   |
| Typed correction-promotion policy          | `built_partial` | the support-slice promotion-policy union remains a live subcomponent inside the broader declarative correction substrate                                | supporting seam   |
| Registry authority cleanup                 | `not_built`     | registry is not yet authoritative enough to be called the full control plane                                                                            | architecture debt |
| Memory-family contract boundary cleanup    | `not_built`     | the family-policy boundary is still smellier than it should be                                                                                          | architecture debt |

## Recently cleared blockers

These slices are now landed:

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup
3. proof-runner adapterization

## Remaining main substrate slices

1. registry authority cleanup
2. memory-family contract / boundary cleanup

## Recently landed work

- full ingestion control-plane flattening
- application-selection / behavior-planning layer
- retrieval + semantic-routing control-plane flattening
- stronger unit seams around retrieval intent, prompt-facing application
  planning, and semantic fallback
- reduced hybrid SQL scaffolding duplication between approved and candidate
  read surfaces
- replacement of the correction engine's raw profile-string gate with typed
  policy

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

- application selection is structural for the prompt-facing durable-memory
  layer, but not yet the final retrieval-fed per-memory-item substrate
- retrieval control is much flatter, but procedure redesign and later SQL
  normalization still remain
- registry authority and cross-boundary policy exposure still need cleanup

## Not live yet

Still not live:

- full post-v5 substrate completion
- reduced-profile self-improving capture on top of the stronger substrate
- learned-guidance advisory planning
- new cross-domain families

## Read next

1. `/memory-system/POST_V3_ARCHITECTURE_REVIEW`
2. `/memory-system/CURRENT_SLICE`
3. `/memory-system/NEXT_SUBSTRATE_PUSH_PLAN`
4. `/memory-system/specs/implementation-sequencing`
