import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GATEWAY_SUBMIT_DIAGNOSTICS_MANIFEST_MAX_BYTES,
  GatewaySubmitDiagnosticsCollector,
  assertGatewaySubmitDiagnosticsManifestBounds,
  createFileGatewaySubmitDiagnosticsSink,
} from "./gateway-submit-diagnostics.ts";

describe("gateway submit diagnostics", () => {
  it("keeps submit diagnostics manifest-bounded while storing phase bodies by ref", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "gateway-submit-diagnostics-"));
    try {
      const collector = new GatewaySubmitDiagnosticsCollector(
        {
          submitId: "submit-diagnostics-test",
          promptHash: "hash-test",
          promptLength: 1200,
          promptByteLength: 1200,
          promptSummary: "Bounded front-door submit prompt summary.",
          startedAt: Date.now(),
        },
        createFileGatewaySubmitDiagnosticsSink({ rootDir }),
      );

      await collector.record("submit_started", {
        reasonCodes: ["front_door_submit_started"],
      });
      await collector.record("before_router_model_call", {
        workflowSummaryCount: 12,
        workflowSummaryBytes: 8_192,
        conversationContextBytes: 4_096,
        routerPayloadBytes: 20_480,
        candidateCount: 8,
        selectedModelRef: "openai-codex/gpt-5.5",
        providerRef: "codex-app-server",
        reasonCodes: ["before_router_model_call"],
      });
      await collector.record("after_router_model_call", {
        workflowSummaryCount: 12,
        workflowSummaryBytes: 8_192,
        conversationContextBytes: 4_096,
        routerPayloadBytes: 20_480,
        candidateCount: 8,
        selectedModelRef: "openai-codex/gpt-5.5",
        providerRef: "codex-app-server",
        reasonCodes: ["after_router_model_call"],
      });

      const bundle = await collector.finalize({
        status: "rejected",
        reasonCodes: ["submit_diagnostics_test"],
      });

      assertGatewaySubmitDiagnosticsManifestBounds(bundle.manifest);
      expect(bundle.manifest.manifestJsonByteCount).toBeLessThanOrEqual(
        GATEWAY_SUBMIT_DIAGNOSTICS_MANIFEST_MAX_BYTES,
      );
      expect(bundle.manifest.phaseCount).toBe(3);
      expect(bundle.manifest.phaseSnapshotRefs).toHaveLength(3);
      expect(bundle.manifest.bodyArtifactRef).toContain("body.json");
      expect(bundle.manifest.manifestArtifactRef).toContain("manifest.json");
      expect(bundle.manifest.maxRouterPayloadBytes).toBe(20_480);
      expect(bundle.manifest.rawPromptStored).toBe(false);
      expect(bundle.manifest.rawResponseStored).toBe(false);
      expect(bundle.manifest.rawProviderLogStored).toBe(false);
      expect(bundle.manifest.hiddenReasoningStored).toBe(false);

      const storedManifest = JSON.parse(
        await fs.readFile(path.join(rootDir, bundle.manifest.manifestArtifactRef ?? ""), "utf8"),
      ) as typeof bundle.manifest;
      expect(storedManifest.manifestJsonByteCount).toBe(bundle.manifest.manifestJsonByteCount);
      expect(storedManifest.phaseSnapshotRefs).toHaveLength(3);
    } finally {
      await fs.rm(rootDir, { force: true, recursive: true });
    }
  });
});
