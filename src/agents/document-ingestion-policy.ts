export const DEFAULT_READ_PAGE_MAX_BYTES = 50 * 1024;
export const MAX_ADAPTIVE_READ_MAX_BYTES = 512 * 1024;

export const DEFAULT_DOCUMENT_READ_CHUNK_LINES = 200;
export const DEFAULT_DOCUMENT_READ_CHUNK_BYTES = 16 * 1024;
export const TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_LINES = 1_000;
export const TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_BYTES = 256 * 1024;

export type DocumentIngestionRecommendation = {
  preferredTool: "read" | "document_read";
  adaptiveReadCeilingBytes: number;
  useDocumentReadReason?: "file_exceeds_read_ceiling" | "read_capped" | "proof_required";
  documentReadDefaults: {
    chunkLines: number;
    chunkBytes: number;
    profile: "conservative" | "trusted_workspace_large_file";
  };
};

export function recommendDocumentIngestion(params: {
  workspaceVisible: boolean;
  fileBytes: number;
  readWasCapped?: boolean;
  proofRequired?: boolean;
}): DocumentIngestionRecommendation {
  const preferredLargeFileDefaults =
    params.workspaceVisible && params.fileBytes > MAX_ADAPTIVE_READ_MAX_BYTES
      ? {
          chunkLines: TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_LINES,
          chunkBytes: TRUSTED_WORKSPACE_DOCUMENT_READ_CHUNK_BYTES,
          profile: "trusted_workspace_large_file" as const,
        }
      : {
          chunkLines: DEFAULT_DOCUMENT_READ_CHUNK_LINES,
          chunkBytes: DEFAULT_DOCUMENT_READ_CHUNK_BYTES,
          profile: "conservative" as const,
        };

  if (params.proofRequired) {
    return {
      preferredTool: "document_read",
      adaptiveReadCeilingBytes: MAX_ADAPTIVE_READ_MAX_BYTES,
      useDocumentReadReason: "proof_required",
      documentReadDefaults: preferredLargeFileDefaults,
    };
  }

  if (params.readWasCapped) {
    return {
      preferredTool: "document_read",
      adaptiveReadCeilingBytes: MAX_ADAPTIVE_READ_MAX_BYTES,
      useDocumentReadReason: "read_capped",
      documentReadDefaults: preferredLargeFileDefaults,
    };
  }

  if (params.workspaceVisible && params.fileBytes <= MAX_ADAPTIVE_READ_MAX_BYTES) {
    return {
      preferredTool: "read",
      adaptiveReadCeilingBytes: MAX_ADAPTIVE_READ_MAX_BYTES,
      documentReadDefaults: preferredLargeFileDefaults,
    };
  }

  return {
    preferredTool: "document_read",
    adaptiveReadCeilingBytes: MAX_ADAPTIVE_READ_MAX_BYTES,
    useDocumentReadReason: "file_exceeds_read_ceiling",
    documentReadDefaults: preferredLargeFileDefaults,
  };
}
