import type { ContextArtifactRecord, ContextArtifactType } from "../runtime-read-models.ts";
import { buildRuntimeId, countRuntimeTokens, hashRuntimeValue } from "../runtime-read-models.ts";

export type BuildContextArtifactInput = {
  artifactType: ContextArtifactType;
  scopeKey?: string;
  sourceObjectIds?: string[];
  sourceSlotKeys?: string[];
  structuredPayload?: Record<string, unknown>;
  renderedText?: string;
  buildPolicyVersion: string;
  contractName?: string;
  contractVersion?: string;
  modelId?: string;
  builtAt?: Date;
};

export function buildContextArtifact(input: BuildContextArtifactInput): ContextArtifactRecord {
  if (!input.structuredPayload && !input.renderedText) {
    throw new Error("context artifact requires structuredPayload or renderedText");
  }

  const normalizedSourceObjectIds = [...(input.sourceObjectIds ?? [])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceSlotKeys = [...(input.sourceSlotKeys ?? [])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const serializedPayload = JSON.stringify(
    {
      artifactType: input.artifactType,
      scopeKey: input.scopeKey ?? null,
      sourceObjectIds: normalizedSourceObjectIds,
      sourceSlotKeys: normalizedSourceSlotKeys,
      structuredPayload: input.structuredPayload ?? null,
      renderedText: input.renderedText ?? null,
      buildPolicyVersion: input.buildPolicyVersion,
    },
    null,
    2,
  );
  const contentHash = hashRuntimeValue(serializedPayload);

  return {
    id: buildRuntimeId(
      "artifact",
      `${input.artifactType}:${input.scopeKey ?? "global"}:${contentHash}`,
    ),
    artifactType: input.artifactType,
    scopeKey: input.scopeKey,
    sourceObjectIds: normalizedSourceObjectIds,
    sourceSlotKeys: normalizedSourceSlotKeys,
    structuredPayload: input.structuredPayload,
    renderedText: input.renderedText,
    contentHash,
    tokenEstimate: countRuntimeTokens(
      input.renderedText ?? JSON.stringify(input.structuredPayload ?? {}),
    ),
    buildPolicyVersion: input.buildPolicyVersion,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    builtAt: input.builtAt ?? new Date(0),
  };
}
