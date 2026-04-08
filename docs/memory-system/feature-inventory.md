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

| Substrate seam                             | Status          | Current truth                                                                                                                                            | Category          |
| ------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Family-definition registry                 | `built_live`    | six-family registry is now the runtime source of truth for workflow-family mapping, proof-family ownership, and the main family policy surfaces          | architecture debt |
| Unified ingestion resolver                 | `built_live`    | all six landed families now resolve through one shared ingestion substrate across transcript and tool submission, with family adapters preserved         | architecture debt |
| Unified clustered lifecycle                | `built_partial` | shared for several memory-object families, and procedures now share explicit staged transition handling even though validated artifacts remain distinct  | architecture debt |
| Unified correction / supersede             | `built_live`    | declarative correction plans now own execution kind, target kind, and held-versus-immediate posture for the current families                             | architecture debt |
| Unified phrase-pattern engine              | `built_partial` | one reviewed phrase substrate serves workflow lessons and response style; family eligibility remains intentionally narrow                                | architecture debt |
| Retrieval feature framework                | `built_partial` | shared feature composition exists and approved-vs-candidate read scaffolding is flatter, but validated-procedure read-model convergence may still remain | architecture debt |
| Behavior-profile bridge                    | `built_partial` | shared prompt-support bridge remains live and now feeds a cheaper, more compact prompt-facing application layer                                          | architecture debt |
| Application-selection / behavior planner   | `built_partial` | selected/suppressed family guidance plus rendering hints are now structural for the prompt-facing durable-memory layer and render with lower prompt tax  | architecture debt |
| Retrieval + semantic-routing control plane | `built_partial` | hybrid retrieval now shares normalized control decisions for hints, project-family shaping, and one shared project semantic fallback query cycle         | architecture debt |
| Write action-stage orchestration           | `built_partial` | candidate submit, transcript auto-capture dispatch, and proof-step execution now share explicit ordered stage seams instead of only top-level switches   | architecture debt |
| Registry-driven proof inspection           | `built_live`    | registry-owned proof policy plus adapterized lifecycle/artifact dispatch now form one honest proof control path for the current family set               | architecture debt |
| Memory testability hardening               | `built_partial` | retrieval intent, prompt-facing application planning, and semantic fallback eligibility now have real unit seams                                         | supporting seam   |
| Hybrid memory-surface SQL scaffolding      | `built_live`    | approved and reviewable-candidate hybrid, get, list, and basic memory-object reads now share bounded scaffolding where the read surfaces already align   | supporting seam   |
| Typed correction-promotion policy          | `built_partial` | the support-slice promotion-policy union remains a live subcomponent inside the broader declarative correction substrate                                 | supporting seam   |
| Registry authority cleanup                 | `built_live`    | registry-owned family policy now drives workflow-family mapping and phrase proof-family ownership without competing local runtime maps                   | architecture debt |
| Memory-family contract boundary cleanup    | `built_live`    | plugin-sdk now owns the shared family policy contract directly instead of re-exporting middleware implementation                                         | architecture debt |

## Recently cleared blockers

These slices are now landed:

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup
3. proof-runner adapterization

## Remaining main substrate slices

The remaining core flattening slices are now landed.
The pre-capture hardening tranche is also now landed.

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

- tighter artifact / read-model convergence after the procedure redesign
- narrower retrieval cleanup only if later self-improving or future-family work
  exposes honest remaining debt

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
- retrieval control is much flatter, but later artifact/read-model convergence
  may still remain
- reduced-profile self-improving capture is now implemented as a bounded
  default-off tranche, now has explicit rollout controls plus structured
  outcome signals, and should still stay narrow before wider enablement
- learned-guidance advisory planning is now implemented as a bounded
  default-off inline slice, now has explicit rollout controls plus structured
  observability, and should still stay narrow before wider enablement
- Main-session internal reminder execution is now structurally isolated from
  visible Main chat
- explicit docs-localization policy phrasing now has a stricter project-rule
  lane instead of relying only on overlapping workflow variants
- explicit file-reference response-style phrasing now has a bounded generalized
  response-style lane plus retrieval subject hinting
- vague shorthand docs/file phrasing still remains intentionally weaker and is
  not accepted as proof that those broader phrasings should auto-promote

## Not live yet

Still not live:

- production-enabled reduced-profile self-improving capture
- production-enabled learned-guidance advisory planning
- new cross-domain families
- broad automatic promotion for vague shorthand docs/file packet phrasing

## Read next

1. `/memory-system/POST_V3_ARCHITECTURE_REVIEW`
2. `/memory-system/CURRENT_SLICE`
3. `/memory-system/NEXT_SUBSTRATE_PUSH_PLAN`
4. `/memory-system/specs/implementation-sequencing`
