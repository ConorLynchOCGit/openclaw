import type {
  MemoryProjectionType,
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import { buildRuntimeId, countRuntimeTokens, hashRuntimeValue } from "../../runtime-read-models.ts";

export const DEFAULT_WORKSPACE_PROJECTION_TARGETS: WorkspaceProjectionTargetRecord[] = [
  {
    targetId: "memory-md",
    targetKind: "memory_md",
    relativePath: "MEMORY.md",
    generatedBlockId: "model-memory",
    allowedCanonicalClasses: ["user", "feedback", "project"],
    allowedKinds: ["preference", "fact", "rule", "procedure"],
    tokenBudget: 600,
    rankingPolicyId: "bootstrap_memory",
    enabled: true,
  },
  {
    targetId: "user-md",
    targetKind: "user_md",
    relativePath: "USER.md",
    generatedBlockId: "model-memory",
    allowedCanonicalClasses: ["user"],
    allowedKinds: ["preference", "rule"],
    tokenBudget: 400,
    rankingPolicyId: "bootstrap_user",
    enabled: true,
  },
  {
    targetId: "agents-md",
    targetKind: "agents_md",
    relativePath: "AGENTS.md",
    generatedBlockId: "model-memory",
    allowedCanonicalClasses: ["feedback", "project"],
    allowedKinds: ["rule", "procedure"],
    tokenBudget: 350,
    rankingPolicyId: "bootstrap_agents",
    enabled: true,
  },
];

export function getWorkspaceProjectionTarget(targetId: string): WorkspaceProjectionTargetRecord {
  const target = DEFAULT_WORKSPACE_PROJECTION_TARGETS.find((entry) => entry.targetId === targetId);
  if (!target) {
    throw new Error(`unknown projection target: ${targetId}`);
  }
  return target;
}

export type BuildProjectionVersionInput = {
  targetId: string;
  projectionType?: MemoryProjectionType;
  renderedText: string;
  sourceObjectIds: string[];
  sourceEventIds?: string[];
  sourceEdgeIds?: string[];
  sourceSlotKeys: string[];
  sourceSetKeys: string[];
  freshness?: WorkspaceProjectionVersionRecord["freshness"];
  staleMarkers?: string[];
  conflictMarkers?: string[];
  retrievalDigest?: WorkspaceProjectionVersionRecord["retrievalDigest"];
  builtAt?: Date;
};

export function buildWorkspaceProjectionVersion(
  input: BuildProjectionVersionInput,
): WorkspaceProjectionVersionRecord {
  const normalizedSourceObjectIds = [...input.sourceObjectIds].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceSlotKeys = [...input.sourceSlotKeys].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceSetKeys = [...input.sourceSetKeys].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceEventIds = [...(input.sourceEventIds ?? [])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceEdgeIds = [...(input.sourceEdgeIds ?? [])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const contentHash = hashRuntimeValue(
    JSON.stringify(
      {
        targetId: input.targetId,
        projectionType: input.projectionType,
        renderedText: input.renderedText,
        sourceObjectIds: normalizedSourceObjectIds,
        sourceEventIds: normalizedSourceEventIds,
        sourceEdgeIds: normalizedSourceEdgeIds,
        sourceSlotKeys: normalizedSourceSlotKeys,
        sourceSetKeys: normalizedSourceSetKeys,
        staleMarkers: input.staleMarkers ?? [],
        conflictMarkers: input.conflictMarkers ?? [],
      },
      null,
      2,
    ),
  );

  return {
    id: buildRuntimeId("projection", `${input.targetId}:${contentHash}`),
    targetId: input.targetId,
    projectionType: input.projectionType,
    contentHash,
    canonicalArtifactPath: `.openclaw/model-memory/projections/${input.targetId}-${contentHash.slice(0, 12)}.md`,
    sourceObjectIds: normalizedSourceObjectIds,
    sourceEventIds: normalizedSourceEventIds,
    sourceEdgeIds: normalizedSourceEdgeIds,
    sourceSlotKeys: normalizedSourceSlotKeys,
    sourceSetKeys: normalizedSourceSetKeys,
    tokenEstimate: countRuntimeTokens(input.renderedText),
    builtAt: input.builtAt ?? new Date(0),
    freshness: input.freshness,
    staleMarkers: input.staleMarkers ?? [],
    conflictMarkers: input.conflictMarkers ?? [],
    retrievalDigest: input.retrievalDigest,
  };
}
