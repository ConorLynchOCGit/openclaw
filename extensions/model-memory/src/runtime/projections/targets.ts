import type {
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
  renderedText: string;
  sourceObjectIds: string[];
  sourceSlotKeys: string[];
  sourceSetKeys: string[];
  builtAt?: Date;
};

export function buildWorkspaceProjectionVersion(
  input: BuildProjectionVersionInput,
): WorkspaceProjectionVersionRecord {
  const normalizedSourceObjectIds = [...input.sourceObjectIds].sort((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceSlotKeys = [...input.sourceSlotKeys].sort((left, right) =>
    left.localeCompare(right),
  );
  const normalizedSourceSetKeys = [...input.sourceSetKeys].sort((left, right) =>
    left.localeCompare(right),
  );
  const contentHash = hashRuntimeValue(
    JSON.stringify(
      {
        targetId: input.targetId,
        renderedText: input.renderedText,
        sourceObjectIds: normalizedSourceObjectIds,
        sourceSlotKeys: normalizedSourceSlotKeys,
        sourceSetKeys: normalizedSourceSetKeys,
      },
      null,
      2,
    ),
  );

  return {
    id: buildRuntimeId("projection", `${input.targetId}:${contentHash}`),
    targetId: input.targetId,
    contentHash,
    canonicalArtifactPath: `.openclaw/model-memory/projections/${input.targetId}-${contentHash.slice(0, 12)}.md`,
    sourceObjectIds: normalizedSourceObjectIds,
    sourceSlotKeys: normalizedSourceSlotKeys,
    sourceSetKeys: normalizedSourceSetKeys,
    tokenEstimate: countRuntimeTokens(input.renderedText),
    builtAt: input.builtAt ?? new Date(0),
  };
}
