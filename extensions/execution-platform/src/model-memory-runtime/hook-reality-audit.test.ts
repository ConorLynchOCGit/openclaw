import { describe, expect, it } from "vitest";
import {
  buildModelMemoryRuntimeHookMaximalityGate,
  buildModelMemoryRuntimeHookRealityAudit,
} from "./hook-reality-audit.ts";
import type { MemoryRuntimeHookClosureEvidence, MemoryRuntimeHookName } from "./types.ts";

describe("model memory runtime hook reality audit", () => {
  it("classifies every required hook without unknowns", () => {
    const audit = buildModelMemoryRuntimeHookRealityAudit();

    expect(audit.status).toBe("passed");
    expect(audit.unknownHooks).toBe(0);
    expect(audit.findings.map((finding) => finding.hookName)).toEqual(
      expect.arrayContaining([
        "assistant_turn_capture",
        "tool_result_proof_capture",
        "workflow_closeout_capture",
        "closeout_opportunity_seed_projection",
        "retrieval_request_interpretation",
        "retrieval_final_inclusion_review",
        "context_pack_assembly",
        "context_pack_insertion",
        "skillifier",
        "proactivity_opportunity_extraction",
        "proactivity_merge_adjudication",
        "heartbeat_proactivity_surfacing",
        "work_queue_opportunity_creation",
        "manual_compact",
        "automatic_compaction",
      ]),
    );
    expect(audit.migrationRequiredCount).toBeGreaterThan(0);
    expect(audit.rawPromptStored).toBe(false);
    expect(audit.rawResponseStored).toBe(false);
    expect(audit.workQueueLifecycleMutated).toBe(false);
  });

  it("fails the maximality gate when a hook lacks live evidence", () => {
    const gate = buildModelMemoryRuntimeHookMaximalityGate({
      hookTable: [
        row("assistant_turn_capture", {
          liveUxWorkflowEvidenceRefs: [],
        }),
      ],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toContain("assistant_turn_capture:live_ux_workflow_evidence_missing");
  });

  it("passes the maximality gate only when all 13 migrations have full evidence", () => {
    const hooks: MemoryRuntimeHookName[] = [
      "assistant_turn_capture",
      "closeout_opportunity_seed_projection",
      "retrieval_request_interpretation",
      "retrieval_final_inclusion_review",
      "context_pack_assembly",
      "context_pack_insertion",
      "skillifier",
      "proactivity_opportunity_extraction",
      "proactivity_merge_adjudication",
      "heartbeat_proactivity_surfacing",
      "work_queue_opportunity_creation",
      "manual_compact",
      "automatic_compaction",
    ];
    const gate = buildModelMemoryRuntimeHookMaximalityGate({
      hookTable: hooks.map((hook) => row(hook)),
    });

    expect(gate.status).toBe("passed");
    expect(gate.totalHooks).toBe(13);
    expect(gate.passedHooks).toBe(13);
    expect(gate.failedHooks).toBe(0);
  });
});

function row(
  hookName: MemoryRuntimeHookName,
  overrides: Partial<MemoryRuntimeHookClosureEvidence> = {},
): MemoryRuntimeHookClosureEvidence {
  return {
    hookName,
    oldPathRefs: [`old://${hookName}`],
    newProductionPathRefs: [`new://${hookName}`],
    oldPathStatus: "compatibility_only",
    middlewareRuntimeJobEvidenceRefs: [`runtime-job://${hookName}/model-task`],
    liveUxWorkflowEvidenceRefs: [`live-ux://${hookName}`],
    qualitativeResult: {
      status: "passed",
      boundedSummary: "The production path produced useful bounded evidence.",
      reviewerRef: `review://${hookName}`,
    },
    artifactRefs: [`artifact://${hookName}`],
    finalStatus: "passed",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
    ...overrides,
  };
}
