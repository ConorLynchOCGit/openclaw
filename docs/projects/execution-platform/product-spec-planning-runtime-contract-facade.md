# Product/Spec Planning Runtime Contract Facade

Production upgrade note: Product/Spec Planning must use scheduler-backed planning nodes and owner-readable readback, not the generic workflow runner.

## What this patch adds

- Adds `product-spec-planning-runtime-contract.ts` as a canonical runtime-facing facade.
- Keeps compatibility with the existing worker contract (`v1`) while exposing runtime policy constants.
- Adds bounded policy constants for storage and closeout behavior:
  - no raw prompt/response/log storage
  - no direct Work Queue lifecycle mutation
  - compile boundary required before child-action execution
  - mission-ledger gate required for clean success

## Test coverage added

- `product-spec-planning-runtime-contract.test.ts`
  - verifies canonical refs include `agent_team.product_spec_planning` and `single_agent.web_research`
  - verifies bounded storage and closeout policy constants
  - verifies v1 compatibility and raw-storage rejection behavior via runtime facade validation
  - verifies factory-created child-action proposal contracts must include runtime work-graph refs before storage
  - verifies the queued workflow runner records a semantically accepted Product/Spec Planning contract

## Current limitation

- Wires the queued Product/Spec Planning runner to the prompt-aware default:
  plain product/spec planning stays `plan_only`, while implementation-planning or child-action-graph wording becomes
  `child_action_graph_proposal` unless an owner decision ref overrides it.
- The contract records bounded proposed child-action refs only; it still does not compile those proposals into runtime jobs without a later approval boundary.
