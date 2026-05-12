import { describe, expect, it } from "vitest";
import { buildKimiLiveSourceEditReadiness } from "./kimi-live-source-edit-proof.ts";

describe("Kimi live source-edit proof target", () => {
  it("exposes bounded readiness evidence without raw storage", () => {
    const readiness = buildKimiLiveSourceEditReadiness({
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      validationRef:
        "validation://pnpm-test-file/extensions-execution-platform-src-codex-bridge-kimi-live-source-edit-proof-test",
    });

    expect(readiness).toEqual({
      artifactKind: "kimi_live_source_edit_readiness",
      status: "ready",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      validationRef:
        "validation://pnpm-test-file/extensions-execution-platform-src-codex-bridge-kimi-live-source-edit-proof-test",
      liveSourceEditProof: true,
      reasonCodes: ["kimi_live_source_edit_adapter_ready"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
  });
});
