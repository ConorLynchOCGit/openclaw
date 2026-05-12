import { describe, expect, it } from "vitest";
import { evaluateMemoryCaptureHook } from "./capture-hooks.ts";

describe("memory capture hooks", () => {
  it("accepts middleware-backed normal chat capture", () => {
    const decision = evaluateMemoryCaptureHook({
      capturePoint: "normal_chat_completed",
      promptHash: "sha256:chat",
      boundedSummary: "Normal chat completed with bounded model-authored summary.",
      modelTaskRefs: ["runtime-job://job-1/model-task/validation"],
      dbOperationRefs: ["runtime-job://job-2/db-operation/metadata"],
    });

    expect(decision.status).toBe("accepted");
    expect(decision.middlewareBacked).toBe(true);
    expect(decision.rawPromptStored).toBe(false);
  });

  it("allows bounded tool-result proof repository capture", () => {
    const decision = evaluateMemoryCaptureHook({
      capturePoint: "tool_result_proof",
      boundedSummary: "Bounded tool result proof fact persisted by canonical repository owner.",
      artifactRefs: ["memory://tool-result/proof-1"],
    });

    expect(decision.status).toBe("accepted");
  });

  it("blocks raw storage flags", () => {
    const decision = evaluateMemoryCaptureHook({
      capturePoint: "owner_correction",
      boundedSummary: "Correction summary",
      modelTaskRefs: ["runtime-job://job-1/model-task/validation"],
      rawPromptStored: true,
    });

    expect(decision.status).toBe("blocked");
    expect(decision.reasonCodes).toContain("raw_storage_flag_detected");
    expect(decision.rawPromptStored).toBe(false);
  });
});
