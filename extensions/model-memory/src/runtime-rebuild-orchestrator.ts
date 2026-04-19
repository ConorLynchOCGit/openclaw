import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { compileProjection } from "./projection-compiler.ts";
import { materializeActiveMemorySets } from "./runtime/active-memory-sets.ts";
import { materializeActiveMemorySlots } from "./runtime/active-memory-slots.ts";
import { buildDerivedContextArtifacts } from "./runtime/packs.ts";
import { DEFAULT_WORKSPACE_PROJECTION_TARGETS } from "./runtime/projections/targets.ts";

export type RuntimeRebuildResult = {
  memoryObjects: Awaited<ReturnType<ModelMemoryCanonicalRepository["listMemoryObjects"]>>;
  activeMemorySlots: Awaited<ReturnType<RuntimeContextRepository["listActiveMemorySlots"]>>;
  activeMemorySets: Awaited<ReturnType<RuntimeContextRepository["listActiveMemorySets"]>>;
  contextArtifacts: Awaited<ReturnType<RuntimeContextRepository["listContextArtifacts"]>>;
  projectionTargets: Awaited<ReturnType<RuntimeContextRepository["listProjectionTargets"]>>;
  projectionVersions: Awaited<ReturnType<RuntimeContextRepository["listProjectionVersions"]>>;
  projectionOutputs: Record<string, string>;
};

export async function rebuildDerivedRuntimeState(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository: RuntimeContextRepository;
  buildPolicyVersion?: string;
  builtAt?: Date;
}): Promise<RuntimeRebuildResult> {
  return input.runtimeRepository.withRuntimeRebuildLock(async (runtimeRepository) => {
    const memoryObjects = await input.canonicalRepository.listMemoryObjects();
    const activeMemorySlots = materializeActiveMemorySlots(memoryObjects);
    const activeMemorySets = materializeActiveMemorySets(memoryObjects);

    await runtimeRepository.replaceActiveMemorySlots(activeMemorySlots);
    await runtimeRepository.replaceActiveMemorySets(activeMemorySets);

    const artifacts = buildDerivedContextArtifacts({
      memoryObjects,
      slots: activeMemorySlots,
      sets: activeMemorySets,
      buildPolicyVersion: input.buildPolicyVersion ?? "v1",
      builtAt: input.builtAt,
    });
    for (const artifact of artifacts) {
      await runtimeRepository.persistContextArtifact(artifact);
    }

    const existingTargets = await runtimeRepository.listProjectionTargets();
    let projectionTargets = existingTargets;
    if (projectionTargets.length === 0) {
      projectionTargets = [];
      for (const target of DEFAULT_WORKSPACE_PROJECTION_TARGETS) {
        projectionTargets.push(await runtimeRepository.upsertProjectionTarget(target));
      }
    }
    const projectionOutputs: Record<string, string> = {};
    for (const target of projectionTargets.filter((entry) => entry.enabled)) {
      const compiled = compileProjection({
        targetId: target.targetId,
        memoryObjects,
        slots: activeMemorySlots,
        sets: activeMemorySets,
        builtAt: input.builtAt,
      });
      projectionOutputs[target.targetId] = compiled.renderedText;
      await runtimeRepository.persistProjectionVersion(compiled.version);
    }

    return {
      memoryObjects,
      activeMemorySlots: await runtimeRepository.listActiveMemorySlots(),
      activeMemorySets: await runtimeRepository.listActiveMemorySets(),
      contextArtifacts: await runtimeRepository.listContextArtifacts(),
      projectionTargets: await runtimeRepository.listProjectionTargets(),
      projectionVersions: await runtimeRepository.listProjectionVersions(),
      projectionOutputs,
    };
  });
}
