import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_INGEST_ENGINE_ENV,
  ingestDocumentForLivePath,
  resolveLiveDocumentIngestEngine,
} from "./document-ingestion.ts";
import type { SemanticInterpreter, SemanticInterpreterResult } from "./semantic-interpreter.ts";

const { ingestDocumentV2ForLivePathMock } = vi.hoisted(() => ({
  ingestDocumentV2ForLivePathMock: vi.fn(),
}));

vi.mock("./mmv2/live-document-ingestion.ts", () => ({
  ingestDocumentV2ForLivePath: ingestDocumentV2ForLivePathMock,
}));

function createLegacyInterpreter(contractVersions: string[]): SemanticInterpreter {
  return {
    interpret(input) {
      contractVersions.push(input.prompt.contract.contractVersion);
      if (input.prompt.contract.contractVersion === "v2-candidate") {
        return Promise.resolve({
          action: "capture",
          objects: [
            {
              candidateType: "fact",
              claim: "Deployment region is region-001.",
              supportingSpans: [
                {
                  blockId: input.sourceWindow.blockDescriptors[0]?.id,
                  lineStart: input.sourceWindow.lineStart,
                  lineEnd: input.sourceWindow.lineEnd,
                  headingPath: input.sourceWindow.headingPath,
                },
              ],
              confidence: "strong",
              shouldStore: true,
            },
          ],
        } satisfies SemanticInterpreterResult);
      }

      return Promise.resolve({
        action: "capture",
        objects: [
          {
            canonicalClass: "project",
            kind: "fact",
            payload: {
              subject: "deployment region",
              value: "region-001",
            },
            provenance: [
              {
                sourceId: input.sourceWindow.id,
                blockId: input.sourceWindow.blockDescriptors[0]?.id,
                lineStart: input.sourceWindow.lineStart,
                lineEnd: input.sourceWindow.lineEnd,
                headingPath: input.sourceWindow.headingPath,
              },
            ],
            confidence: "strong",
            durability: "durable",
            reviewMode: "auto_accept",
          },
        ],
      } satisfies SemanticInterpreterResult);
    },
  };
}

describe("document-ingestion live engine selection", () => {
  beforeEach(() => {
    delete process.env[DOCUMENT_INGEST_ENGINE_ENV];
    ingestDocumentV2ForLivePathMock.mockReset();
  });

  afterEach(() => {
    delete process.env[DOCUMENT_INGEST_ENGINE_ENV];
  });

  it("defaults document sources to MMV2 for the live path", async () => {
    const expectedResult = {
      source: { id: "source-001", sourceKind: "document" },
      windows: [{ id: "window-001" }],
      windowResults: [{ sourceWindowId: "window-001", action: "ignore" }],
      capturedObjects: [],
    };
    ingestDocumentV2ForLivePathMock.mockResolvedValue(expectedResult);

    const result = await ingestDocumentForLivePath({
      document: {
        externalSourceId: "doc-001",
        text: "Deployment region is region-001.",
      },
      modelId: "model-001",
      interpreter: { interpret: vi.fn() },
    });

    expect(resolveLiveDocumentIngestEngine({ sourceKind: "document" })).toBe("mmv2");
    expect(ingestDocumentV2ForLivePathMock).toHaveBeenCalledOnce();
    expect(result).toBe(expectedResult);
  });

  it("allows a live rollback to the legacy document ingest path", async () => {
    process.env[DOCUMENT_INGEST_ENGINE_ENV] = "v1";
    const contractVersions: string[] = [];

    const result = await ingestDocumentForLivePath({
      document: {
        externalSourceId: "doc-legacy-001",
        text: "Deployment region is region-001.",
      },
      modelId: "model-legacy-001",
      candidateModelId: "model-legacy-candidate-001",
      interpreter: createLegacyInterpreter(contractVersions),
    });

    expect(resolveLiveDocumentIngestEngine({ sourceKind: "document" })).toBe("v1");
    expect(ingestDocumentV2ForLivePathMock).not.toHaveBeenCalled();
    expect(contractVersions).toEqual(["v2-candidate", "v2-canonicalization"]);
    expect(result.capturedObjects).toHaveLength(1);
    expect(result.capturedObjects[0]?.contractVersion).toBe("v2-canonicalization");
  });

  it("keeps daily continuity on the legacy path even when MMV2 is the default", async () => {
    process.env[DOCUMENT_INGEST_ENGINE_ENV] = "mmv2";
    const contractVersions: string[] = [];

    const result = await ingestDocumentForLivePath({
      document: {
        externalSourceId: "daily-001",
        text: "Deployment region is region-001.",
        sourceKind: "daily_continuity",
      },
      modelId: "model-daily-001",
      interpreter: createLegacyInterpreter(contractVersions),
    });

    expect(resolveLiveDocumentIngestEngine({ sourceKind: "daily_continuity" })).toBe("v1");
    expect(ingestDocumentV2ForLivePathMock).not.toHaveBeenCalled();
    expect(result.source.sourceKind).toBe("daily_continuity");
    expect(contractVersions).toEqual(["v2-candidate", "v2-canonicalization"]);
  });

  it("rejects unsupported live engine override values explicitly", () => {
    process.env[DOCUMENT_INGEST_ENGINE_ENV] = "bad-value";

    expect(() => resolveLiveDocumentIngestEngine({ sourceKind: "document" })).toThrow(
      `Unsupported ${DOCUMENT_INGEST_ENGINE_ENV} value: bad-value. Expected mmv2 or v1.`,
    );
  });
});
