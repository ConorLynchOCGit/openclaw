import { describe, expect, it } from "vitest";
import { buildKimiLiveSourceEditReadiness } from "./kimi-live-source-edit-proof.ts";

describe("Kimi live source-edit proof target", () => {
  it("exposes bounded readiness evidence without raw storage", () => {
    const readiness = buildKimiLiveSourceEditReadiness({
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      validationRef:
        "validation://pnpm-test-file/extensions-execution-platform-src-codex-bridge-kimi-live-source-edit-proof-test",
      workerLoopTraceRef: "runtime-tool://worker/evidence/handoff",
      workerLoopV2TraceRefs: [
        "runtime-tool://worker/v2/evidence/handoff-1",
        "runtime-tool://worker/v2/evidence/handoff-2",
      ],
      toolUsingWorkerTraceRefs: [
        "runtime-tool://worker/tool-using/evidence/handoff-1",
        "runtime-tool://worker/tool-using/evidence/handoff-2",
      ],
      toolUsingWorkerTraceRefs46003efd: [
        "runtime-tool://worker/tool-using/evidence/handoff-1-46003efd",
        "runtime-tool://worker/tool-using/evidence/handoff-2-46003efd",
      ],
    });

    expect(readiness).toEqual({
      artifactKind: "kimi_live_source_edit_readiness",
      status: "ready",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      validationRef:
        "validation://pnpm-test-file/extensions-execution-platform-src-codex-bridge-kimi-live-source-edit-proof-test",
      workerLoopTraceRef: "runtime-tool://worker/evidence/handoff",
      workerLoopV2TraceRefs: [
        "runtime-tool://worker/v2/evidence/handoff-1",
        "runtime-tool://worker/v2/evidence/handoff-2",
      ],
      toolUsingWorkerTraceRefs: [
        "runtime-tool://worker/tool-using/evidence/handoff-1",
        "runtime-tool://worker/tool-using/evidence/handoff-2",
      ],
      toolUsingWorkerTraceRefs46003efd: [
        "runtime-tool://worker/tool-using/evidence/handoff-1-46003efd",
        "runtime-tool://worker/tool-using/evidence/handoff-2-46003efd",
      ],
      liveSourceEditProof: true,
      reasonCodes: ["kimi_live_source_edit_adapter_ready"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
  });
});
