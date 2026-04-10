import type { MemoryMiddlewareDb, MemoryObjectRecord } from "./db/runtime.js";
import type { NativeMemoryProjectionSkippedRecord } from "./native-memory-projection-audit.js";
import {
  NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS,
  renderProjectionBody,
  syncProjectionFile,
  trimProjectionCandidatesToBudget,
  type NativeMemoryProjectionSyncResult,
} from "./native-memory-projection-compiler.js";
import {
  buildNativeMemoryProjectionCandidate,
  type NativeMemoryProjectionCandidate,
} from "./native-memory-projection-eligibility.js";
import {
  discoverWorkspaceProjectProjectionTargets,
  resolveProjectProjectionTarget,
  type WorkspaceProjectProjectionTarget,
} from "./native-memory-projection-routing.js";
import {
  isEligibleForProjectProjection,
  resolveNativeMemoryProjectionScope,
} from "./native-memory-projection-scope.js";

const PROJECT_PROJECTION_TITLE = "Compiled Project Memory";

export type ProjectProjectionCompilationResult = NativeMemoryProjectionSyncResult & {
  projectSlug: string;
  selectedCount: number;
  omittedCount: number;
  sourceCount: number;
  pointerLine: string;
  selectedSourceIds: string[];
  omittedSourceIds: string[];
};

type ProjectProjectionGroup = {
  target: WorkspaceProjectProjectionTarget;
  records: MemoryObjectRecord[];
  candidates: NativeMemoryProjectionCandidate[];
};

async function loadApprovedProjectProjectionRecords(params: {
  db: MemoryMiddlewareDb;
  limit: number;
}): Promise<MemoryObjectRecord[]> {
  const result = await params.db.queries.listMemoryObjects({
    scope: "approved_only",
    kind: "project",
    limit: params.limit,
  });
  if (!result.accepted) {
    throw new Error(`project native projection query failed: ${result.reason}`);
  }
  return result.records.filter(
    (record): record is MemoryObjectRecord => record.objectType === "memory_object",
  );
}

export async function syncProjectLocalProjections(params: {
  db: MemoryMiddlewareDb;
  workspaceDir: string;
  write: boolean;
  limit?: number;
}): Promise<{
  results: ProjectProjectionCompilationResult[];
  pointerItems: string[];
  projectedSourceIds: Set<string>;
  unmatched: Array<{ sourceId: string; reason: string }>;
  skipped: NativeMemoryProjectionSkippedRecord[];
}> {
  const records = await loadApprovedProjectProjectionRecords({
    db: params.db,
    limit: params.limit ?? 120,
  });
  const targets = await discoverWorkspaceProjectProjectionTargets(params.workspaceDir);
  const allWorkspaceTargets = await discoverWorkspaceProjectProjectionTargets(params.workspaceDir, {
    includeUnallowlisted: true,
  });
  const groups = new Map<string, ProjectProjectionGroup>(
    targets.map((target) => [
      target.slug,
      {
        target,
        records: [],
        candidates: [],
      },
    ]),
  );
  const unmatched: Array<{ sourceId: string; reason: string }> = [];
  const skipped: NativeMemoryProjectionSkippedRecord[] = [];

  for (const record of records) {
    const scope = resolveNativeMemoryProjectionScope(record);
    if (!isEligibleForProjectProjection(scope)) {
      skipped.push({
        sourceId: record.id,
        reason: "scope_filtered",
        scopeKind: scope.kind,
        ...(scope.agentKey ? { agentKey: scope.agentKey } : {}),
      });
      continue;
    }
    const target = resolveProjectProjectionTarget(record, targets);
    if (!target) {
      const unallowlistedTarget = resolveProjectProjectionTarget(record, allWorkspaceTargets);
      unmatched.push({
        sourceId: record.id,
        reason: unallowlistedTarget
          ? "project_target_not_allowlisted"
          : "no_workspace_project_target",
      });
      continue;
    }
    const candidate = buildNativeMemoryProjectionCandidate(record);
    if (!candidate) {
      unmatched.push({ sourceId: record.id, reason: "ineligible_project_projection_candidate" });
      continue;
    }
    const existing = groups.get(target.slug) ?? {
      target,
      records: [],
      candidates: [],
    };
    existing.records.push(record);
    existing.candidates.push(candidate);
    groups.set(target.slug, existing);
  }

  const results: ProjectProjectionCompilationResult[] = [];
  const projectedSourceIds = new Set<string>();
  for (const group of [...groups.values()].toSorted((left, right) =>
    left.target.slug.localeCompare(right.target.slug),
  )) {
    const trimmed = trimProjectionCandidatesToBudget({
      candidates: group.candidates,
      maxChars: NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS["project-memory-digest"],
    });
    const body = renderProjectionBody({
      title: PROJECT_PROJECTION_TITLE,
      items: trimmed.kept.map((candidate) => candidate.text),
      omittedCount: trimmed.omittedCount,
    });
    const sync = await syncProjectionFile({
      workspaceDir: params.workspaceDir,
      target: {
        target: "project-memory-digest",
        projectSlug: group.target.slug,
        projectFileName: group.target.projectionFileName,
      },
      body,
      write: params.write,
    });
    for (const candidate of trimmed.kept) {
      projectedSourceIds.add(candidate.sourceId);
    }
    results.push({
      ...sync,
      projectSlug: group.target.slug,
      selectedCount: trimmed.kept.length,
      omittedCount: trimmed.omittedCount,
      sourceCount: group.candidates.length,
      pointerLine: `Project ${group.target.slug}: see ${group.target.relProjectionPath}`,
      selectedSourceIds: trimmed.kept.map((candidate) => candidate.sourceId),
      omittedSourceIds: trimmed.omitted.map((candidate) => candidate.sourceId),
    });
  }

  return {
    results,
    pointerItems: results
      .filter((result) => result.sourceCount > 0)
      .map((result) => result.pointerLine),
    projectedSourceIds,
    unmatched,
    skipped,
  };
}
