import type {
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "./runtime-read-models.ts";

export type HarnessProjectionOutput = {
  targetId: string;
  relativePath: string;
  content: string;
};

export function buildHarnessProjectionOutputs(input: {
  projectionTargets: WorkspaceProjectionTargetRecord[];
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionOutputs: Record<string, string>;
}): HarnessProjectionOutput[] {
  const targetById = new Map(
    input.projectionTargets.map((target) => [target.targetId, target] as const),
  );

  return [...input.projectionVersions]
    .toSorted((left, right) => left.targetId.localeCompare(right.targetId))
    .flatMap((version) => {
      const target = targetById.get(version.targetId);
      const content = input.projectionOutputs[version.targetId];
      if (!target || !target.enabled || !content || content.trim().length === 0) {
        return [];
      }
      return [
        {
          targetId: version.targetId,
          relativePath: target.relativePath,
          content,
        },
      ];
    });
}
