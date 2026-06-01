import { describe, expect, it } from "vitest";
import {
  assertDiagnosticManifestBounds,
  captureHeapPhaseSnapshot,
  captureProviderResponseShapeDiagnostic,
} from "./runtime-diagnostics.ts";

describe("runtime diagnostics", () => {
  it("captures bounded provider response shape without raw bodies", () => {
    const diagnostic = captureProviderResponseShapeDiagnostic({
      modelRef: "qwen/qwen3-coder-next",
      providerId: "openrouter",
      providerPath: "openrouter",
      profileRef: "structured-adapter-profile://local_semantic_extraction/example",
      taskClass: "local_semantic_extraction",
      callSite: "resource.scout.specialist_handoff",
      reasoningModeSent: "none",
      responseFormatSent: "prompt_only_json",
      parserMode: "tool_json",
      requestByteCount: 12_345,
      maxOutputTokens: 2_400,
      timeoutMs: 90_000,
      timeoutState: "completed_before_timeout",
      body: {
        id: "chatcmpl-proof",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "{\"tool\":\"ok\"}" },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      },
      finishReason: "stop",
      nativeFinishReason: "stop",
      parsedContentLength: 13,
      usage: { promptTokens: 100, outputTokens: 20 },
      inputBundleHash: "sha256:input",
      outputHash: "sha256:output",
      reasonCodes: ["provider_response_shape_captured"],
    });

    expect(diagnostic).toMatchObject({
      artifactKind: "execution_platform.provider_response_shape_diagnostic",
      modelRef: "qwen/qwen3-coder-next",
      providerStarted: true,
      choiceCount: 1,
      contentLengthByChoice: [13],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
    expect(diagnostic.bodyKeys).toEqual(["choices", "id", "usage"]);
    expect(diagnostic.messageKeys).toEqual(["content", "role"]);
    expect(JSON.stringify(diagnostic)).not.toContain("chatcmpl-proof");
    expect(JSON.stringify(diagnostic)).not.toContain('{"tool":"ok"}');
  });

  it("captures heap and manifest pressure by phase", () => {
    const snapshot = captureHeapPhaseSnapshot({
      phase: "resource_demand_open",
      gateKind: "resource_demand_open",
      graphId: "graph-proof",
      nodeId: "node-proof",
      memoryUsage: {
        rss: 1000,
        heapTotal: 800,
        heapUsed: 500,
        external: 100,
        arrayBuffers: 40,
      },
      graphNodeCount: 12,
      graphEdgeCount: 14,
      activeBranchCount: 3,
      metadataObjects: [
        { ref: "metadata://small", value: { a: "b" } },
        { ref: "metadata://large", value: { refs: Array.from({ length: 20 }, (_, i) => `r-${i}`) } },
      ],
      artifactBodies: [{ ref: "payload://body", value: { body: "x".repeat(2000) } }],
      latestRunStateMetadataBytes: 1000,
      schedulerProgressMetadataBytes: 2000,
      workQueueProjectionMetadataBytes: 1500,
      providerRequestByteCount: 12_345,
      reasonCodes: ["heap_phase_snapshot_recorded"],
    });

    expect(snapshot).toMatchObject({
      artifactKind: "execution_platform.heap_phase_snapshot",
      phase: "resource_demand_open",
      gateKind: "resource_demand_open",
      graphNodeCount: 12,
      graphEdgeCount: 14,
      activeBranchCount: 3,
      largestMetadataRef: "metadata://large",
      largestArtifactBodyRef: "payload://body",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(snapshot.largestMetadataBytes).toBeGreaterThan(100);
    expect(snapshot.largestArtifactBodyBytes).toBeGreaterThan(2000);
  });

  it("fails manifests before overflow becomes opaque", () => {
    expect(() =>
      assertDiagnosticManifestBounds({
        label: "latest-run-state",
        value: { refs: Array.from({ length: 200 }, (_, i) => `ref-${i}`) },
        maxBytes: 100,
      }),
    ).toThrow(/diagnostic_manifest_overflow:latest-run-state/u);
  });
});
