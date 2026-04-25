import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  deriveLifecycleExclusion,
  normalizeDerivedArtifactRelativePath,
  uniqueSortedStrings,
} from "../../derived-artifact.ts";
import type { ProjectionDigestArtifact } from "../../projection-compiler.ts";
import type {
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";

export type ProjectionMaterializerEntry = {
  targetId: string;
  renderedText: string;
  version: WorkspaceProjectionVersionRecord;
  digest: ProjectionDigestArtifact;
};

export type ProjectionMaterializationArtifactEntry = {
  projection_id: string;
  projection_type: string;
  target_id: string;
  markdown_path: string;
  json_path: string;
  content_hash: string;
  source_memory_ids: string[];
  source_event_ids: string[];
  source_edge_ids: string[];
  freshness: ProjectionDigestArtifact["freshness"];
  stale_markers: string[];
  conflict_markers: string[];
  active_source_memory_validation_status: "valid" | "empty";
};

export type ProjectionMaterializationResult = {
  schema_version: "memory_projection_artifact_index.v1";
  generated_at: string;
  projection_count: number;
  root_write_back_status: "disabled";
  artifact_entries: ProjectionMaterializationArtifactEntry[];
  index_path: string;
};

export type ProjectionMaterializerInput = {
  workspaceRoot: string;
  entries: ProjectionMaterializerEntry[];
  activeMemoryIds: Iterable<string>;
  generatedAt?: Date;
};

function isActiveProjectionSource(memory: RuntimeMemoryRecord): boolean {
  return (
    !deriveLifecycleExclusion({
      lifecycleState: memory.lifecycleState,
      invalidAt: memory.expiredAt?.toISOString(),
    }) && !memory.supersededAt
  );
}

export function buildActiveProjectionSourceIdSet(
  memoryObjects: RuntimeMemoryRecord[],
): Set<string> {
  return new Set(memoryObjects.filter(isActiveProjectionSource).map((memory) => memory.id));
}

function normalizeRelativeArtifactPath(relativePath: string): string {
  return normalizeDerivedArtifactRelativePath({
    relativePath,
    allowedPrefixes: [".openclaw/model-memory/projections/"],
    allowedExtensions: [".md"],
  });
}

function activeValidationStatus(sourceMemoryIds: string[]): "valid" | "empty" {
  return sourceMemoryIds.length > 0 ? "valid" : "empty";
}

function assertActiveSourceMemoryIds(params: {
  entry: ProjectionMaterializerEntry;
  activeMemoryIds: Set<string>;
}): string[] {
  const sourceMemoryIds = uniqueSortedStrings([...params.entry.version.sourceObjectIds]);
  const inactive = sourceMemoryIds.filter((id) => !params.activeMemoryIds.has(id));
  if (inactive.length > 0) {
    throw new Error(
      `projection ${params.entry.targetId} references inactive source memory ids: ${inactive.join(", ")}`,
    );
  }
  return sourceMemoryIds;
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

function buildJsonArtifact(params: {
  entry: ProjectionMaterializerEntry;
  markdownRelativePath: string;
  jsonRelativePath: string;
  sourceMemoryIds: string[];
}): Record<string, unknown> {
  const { entry } = params;
  return {
    schema_version: "memory_projection_artifact.v1",
    projection_id: entry.digest.projectionId,
    projection_type: entry.digest.projectionType,
    target_id: entry.targetId,
    source_memory_ids: params.sourceMemoryIds,
    source_event_ids: entry.version.sourceEventIds ?? entry.digest.sourceEventIds,
    source_edge_ids: entry.version.sourceEdgeIds ?? entry.digest.sourceEdgeIds,
    content_hash: entry.version.contentHash,
    compiled_at: entry.version.builtAt.toISOString(),
    freshness: entry.version.freshness ?? entry.digest.freshness,
    stale_markers: entry.version.staleMarkers ?? entry.digest.staleMarkers,
    conflict_markers: entry.version.conflictMarkers ?? entry.digest.conflictMarkers,
    artifact_paths: {
      markdown_path: params.markdownRelativePath,
      json_path: params.jsonRelativePath,
    },
    retrieval_digest: entry.version.retrievalDigest ?? entry.digest.retrievalDigest,
    root_write_back_status: "disabled",
  };
}

export async function materializeProjectionArtifacts(
  input: ProjectionMaterializerInput,
): Promise<ProjectionMaterializationResult> {
  const generatedAt = input.generatedAt ?? new Date();
  const activeMemoryIds = new Set(input.activeMemoryIds);
  const artifactEntries: ProjectionMaterializationArtifactEntry[] = [];

  for (const entry of input.entries) {
    const markdownRelativePath = normalizeRelativeArtifactPath(entry.version.canonicalArtifactPath);
    const jsonRelativePath = markdownRelativePath.replace(/\.md$/u, ".json");
    const markdownPath = path.join(input.workspaceRoot, markdownRelativePath);
    const jsonPath = path.join(input.workspaceRoot, jsonRelativePath);
    const sourceMemoryIds = assertActiveSourceMemoryIds({ entry, activeMemoryIds });
    const jsonArtifact = buildJsonArtifact({
      entry,
      markdownRelativePath,
      jsonRelativePath,
      sourceMemoryIds,
    });

    await atomicWriteFile(markdownPath, `${entry.renderedText.trimEnd()}\n`);
    await atomicWriteFile(jsonPath, `${JSON.stringify(jsonArtifact, null, 2)}\n`);

    artifactEntries.push({
      projection_id: entry.digest.projectionId,
      projection_type: entry.digest.projectionType,
      target_id: entry.targetId,
      markdown_path: markdownRelativePath,
      json_path: jsonRelativePath,
      content_hash: entry.version.contentHash,
      source_memory_ids: sourceMemoryIds,
      source_event_ids: entry.version.sourceEventIds ?? entry.digest.sourceEventIds,
      source_edge_ids: entry.version.sourceEdgeIds ?? entry.digest.sourceEdgeIds,
      freshness: entry.version.freshness ?? entry.digest.freshness,
      stale_markers: entry.version.staleMarkers ?? entry.digest.staleMarkers,
      conflict_markers: entry.version.conflictMarkers ?? entry.digest.conflictMarkers,
      active_source_memory_validation_status: activeValidationStatus(sourceMemoryIds),
    });
  }

  const indexRelativePath = ".openclaw/model-memory/projections/index.json";
  const indexPath = path.join(input.workspaceRoot, indexRelativePath);
  const index: ProjectionMaterializationResult = {
    schema_version: "memory_projection_artifact_index.v1",
    generated_at: generatedAt.toISOString(),
    projection_count: artifactEntries.length,
    root_write_back_status: "disabled",
    artifact_entries: artifactEntries.toSorted((left, right) =>
      left.markdown_path.localeCompare(right.markdown_path),
    ),
    index_path: indexRelativePath,
  };
  await atomicWriteFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  return index;
}
