import { createHash } from "node:crypto";

export type MmV2ModelCallTrace = {
  contractName: string;
  contractVersion: string;
  requestedModelId: string;
  resolvedModelId: string | null;
  promptHash: string;
  inputHash: string;
  normalization?: {
    applied: boolean;
    rawPayloadHash: string | null;
    normalizedPayloadHash: string | null;
    normalizedInputHash: string | null;
    changedPaths: string[];
    semanticChangedPaths: string[];
    placeholderCounts: {
      eventIds: number;
      sourceIds: number;
      segmentIds: number;
      candidateIds: number;
      memoryIds: number;
      timestamps: number;
    };
    sortedCollections: string[];
    requestedSanitizedPrompt: boolean;
    deliveryMode: "original" | "sanitized";
    guardAllowed: boolean;
    guardBlockedPaths: string[];
  } | null;
};

function stableHash(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256")
    .update(text ?? "")
    .digest("hex");
}

export function buildModelCallTrace(input: {
  request: {
    contract: {
      contractName: string;
      contractVersion: string;
      modelId: string;
    };
    systemPrompt: string;
    userPrompt: string;
    responseFormat?: unknown;
    responseOptions?: unknown;
  };
  response: {
    resolvedModelId?: string | null;
  };
  normalization?: MmV2ModelCallTrace["normalization"];
}): MmV2ModelCallTrace {
  return {
    contractName: input.request.contract.contractName,
    contractVersion: input.request.contract.contractVersion,
    requestedModelId: input.request.contract.modelId,
    resolvedModelId: input.response.resolvedModelId ?? null,
    promptHash: stableHash({
      contractName: input.request.contract.contractName,
      contractVersion: input.request.contract.contractVersion,
      systemPrompt: input.request.systemPrompt,
      responseFormat: input.request.responseFormat ?? null,
      responseOptions: input.request.responseOptions ?? null,
    }),
    inputHash: stableHash(input.request.userPrompt),
    normalization: input.normalization ?? null,
  };
}
