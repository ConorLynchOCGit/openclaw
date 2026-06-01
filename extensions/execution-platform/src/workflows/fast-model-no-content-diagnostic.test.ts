import { describe, expect, it } from "vitest";
import {
  buildFailedPacketReplayResult,
  buildFastModelNoContentDiagnostic,
} from "./fast-model-no-content-diagnostic.ts";

describe("fast model no-content diagnostics", () => {
  it("classifies no-content provider failures with exact structural reason classes", () => {
    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "local_semantic_extraction",
        callSite: "obligation.semantic_content",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 12_000,
        parsedContentLength: 0,
        timedOut: true,
        errorReasonCode: "openrouter_network_timeout",
      }).classifiedReason,
    ).toBe("client_abort_before_provider_finish");

    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "schema_normalization",
        callSite: "obligation.targeted_normalization",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 4_000,
        parsedContentLength: 0,
        choiceCount: 1,
        contentLengthByChoice: [700],
      }).classifiedReason,
    ).toBe("adapter_content_extraction_failed");

    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "local_semantic_extraction",
        callSite: "obligation.semantic_content",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 22_000,
        elapsedMs: 60_005,
        timeoutMs: 60_000,
        parsedContentLength: 0,
        choiceCount: 1,
        contentLengthByChoice: [0],
        finishReason: null,
        nativeFinishReason: null,
        errorReasonCode: "openrouter_no_content",
      }).classifiedReason,
    ).toBe("timeout_adjacent_empty_content");

    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "local_semantic_extraction",
        callSite: "obligation.semantic_content",
        modelRef: "moonshotai/kimi-k2.6",
        expectedModelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 4_000,
        parsedContentLength: 0,
      }).classifiedReason,
    ).toBe("wrong_model_or_profile");
  });

  it("records repeated failed packet replay as diagnostic evidence, not a silent rescue", () => {
    const attempt = buildFastModelNoContentDiagnostic({
      taskClass: "local_semantic_extraction",
      callSite: "obligation.semantic_content",
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      inputByteLength: 10_000,
      inputBundleRef: "runtime-job://job/packet-input/commitment-a",
      inputBundleHash: "sha256:packet-input",
      parsedContentLength: 0,
      choiceCount: 0,
    });
    const replay = buildFailedPacketReplayResult({
      replayId: "replay-1",
      commitmentId: "commitment-a",
      inputBundleRef: "runtime-job://job/packet-input/commitment-a",
      inputBundleHash: "sha256:packet-input",
      attempts: [attempt, { ...attempt, retryNumber: 1 }],
    });

    expect(replay.status).toBe("reproduced_failure");
    expect(replay.reasonCodes).toContain("same_bounded_input_reproduced_no_content");
  });
});
