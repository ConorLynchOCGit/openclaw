import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_READ_CHUNK_BYTES,
  DEFAULT_DOCUMENT_READ_CHUNK_LINES,
  MAX_ADAPTIVE_READ_MAX_BYTES,
  recommendDocumentIngestion,
  TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_BYTES,
  TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_LINES,
} from "./document-ingestion-policy.js";

describe("document ingestion policy", () => {
  it("prefers read for workspace-visible files under the adaptive ceiling", () => {
    expect(
      recommendDocumentIngestion({
        workspaceVisible: true,
        fileBytes: MAX_ADAPTIVE_READ_MAX_BYTES,
      }),
    ).toMatchObject({
      preferredTool: "read",
      adaptiveReadCeilingBytes: MAX_ADAPTIVE_READ_MAX_BYTES,
      documentReadDefaults: {
        profile: "conservative",
        chunkLines: DEFAULT_DOCUMENT_READ_CHUNK_LINES,
        chunkBytes: DEFAULT_DOCUMENT_READ_CHUNK_BYTES,
      },
    });
  });

  it("prefers document_read for workspace-visible files above the adaptive ceiling", () => {
    expect(
      recommendDocumentIngestion({
        workspaceVisible: true,
        fileBytes: MAX_ADAPTIVE_READ_MAX_BYTES + 1,
      }),
    ).toMatchObject({
      preferredTool: "document_read",
      useDocumentReadReason: "file_exceeds_read_ceiling",
      documentReadDefaults: {
        profile: "trusted_workspace_large_file",
        chunkLines: TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_LINES,
        chunkBytes: TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_BYTES,
      },
    });
  });

  it("prefers document_read when read was capped", () => {
    expect(
      recommendDocumentIngestion({
        workspaceVisible: true,
        fileBytes: 12_000,
        readWasCapped: true,
      }),
    ).toMatchObject({
      preferredTool: "document_read",
      useDocumentReadReason: "read_capped",
    });
  });

  it("forces document_read when proof-grade coverage is required", () => {
    expect(
      recommendDocumentIngestion({
        workspaceVisible: true,
        fileBytes: 12_000,
        proofRequired: true,
      }),
    ).toMatchObject({
      preferredTool: "document_read",
      useDocumentReadReason: "proof_required",
    });
  });

  it("keeps conservative document_read defaults for non-workspace files", () => {
    expect(
      recommendDocumentIngestion({
        workspaceVisible: false,
        fileBytes: MAX_ADAPTIVE_READ_MAX_BYTES + 1,
      }),
    ).toMatchObject({
      preferredTool: "document_read",
      documentReadDefaults: {
        profile: "conservative",
        chunkLines: DEFAULT_DOCUMENT_READ_CHUNK_LINES,
        chunkBytes: DEFAULT_DOCUMENT_READ_CHUNK_BYTES,
      },
    });
  });
});
