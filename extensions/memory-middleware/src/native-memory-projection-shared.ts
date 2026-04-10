import type { MemoryMiddlewareDb } from "./db/runtime.js";
import type { MemoryObjectRecord } from "./db/runtime.js";
import type { NativeMemoryProjectionSkippedRecord } from "./native-memory-projection-audit.js";
import {
  NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS,
  renderProjectionBody,
  syncProjectionFile,
  trimProjectionCandidatesToBudget,
  type NativeMemoryProjectionSyncResult,
} from "./native-memory-projection-compiler.js";
import {
  buildNativeMemoryProjectionCandidates,
  type SharedBootstrapProjectionTarget,
} from "./native-memory-projection-eligibility.js";
import {
  isSharedProjectionScope,
  resolveNativeMemoryProjectionScope,
} from "./native-memory-projection-scope.js";

const SHARED_PROJECTION_TITLES: Record<SharedBootstrapProjectionTarget, string> = {
  "user-profile": "Compiled User Memory",
  "tool-preferences": "Compiled Tool Preferences",
  "memory-digest": "Compiled Memory Digest",
};

const SHARED_QUERY_KINDS = ["user", "feedback", "project"] as const;

export type SharedProjectionCompilationResult = NativeMemoryProjectionSyncResult & {
  selectedCount: number;
  omittedCount: number;
  sourceCount: number;
  selectedSourceIds: string[];
  omittedSourceIds: string[];
};

async function loadApprovedSharedProjectionRecords(params: {
  db: MemoryMiddlewareDb;
  limitPerKind: number;
}): Promise<MemoryObjectRecord[]> {
  const records: MemoryObjectRecord[] = [];
  for (const kind of SHARED_QUERY_KINDS) {
    const result = await params.db.queries.listMemoryObjects({
      scope: "approved_only",
      kind,
      limit: params.limitPerKind,
    });
    if (!result.accepted) {
      throw new Error(`shared native projection query failed for ${kind}: ${result.reason}`);
    }
    records.push(
      ...result.records.filter(
        (record): record is MemoryObjectRecord => record.objectType === "memory_object",
      ),
    );
  }
  return records;
}

export async function syncSharedBootstrapProjections(params: {
  db: MemoryMiddlewareDb;
  workspaceDir: string;
  write: boolean;
  limitPerKind?: number;
  excludeSourceIds?: ReadonlySet<string>;
  extraMemoryDigestItems?: string[];
}): Promise<{
  results: SharedProjectionCompilationResult[];
  skipped: NativeMemoryProjectionSkippedRecord[];
}> {
  const records = await loadApprovedSharedProjectionRecords({
    db: params.db,
    limitPerKind: params.limitPerKind ?? 80,
  });
  const skipped: NativeMemoryProjectionSkippedRecord[] = [];
  const scopedRecords = records.filter((record) => {
    const scope = resolveNativeMemoryProjectionScope(record);
    if (isSharedProjectionScope(scope)) {
      return true;
    }
    skipped.push({
      sourceId: record.id,
      reason: "scope_filtered",
      scopeKind: scope.kind,
      ...(scope.agentKey ? { agentKey: scope.agentKey } : {}),
    });
    return false;
  });
  const candidates = buildNativeMemoryProjectionCandidates(scopedRecords).filter(
    (candidate) => !params.excludeSourceIds?.has(candidate.sourceId),
  );
  const targets: SharedBootstrapProjectionTarget[] = [
    "user-profile",
    "tool-preferences",
    "memory-digest",
  ];

  const results: SharedProjectionCompilationResult[] = [];
  for (const target of targets) {
    const selectedForTarget = candidates.filter((candidate) => candidate.target === target);
    const selectedForTargetWithPointers =
      target === "memory-digest"
        ? [
            ...(params.extraMemoryDigestItems ?? []).map((text, index) => ({
              sourceId: `project-pointer:${String(index)}`,
              sourceKind: "project" as const,
              target,
              priority: 10_000 - index,
              text,
              updatedAt: "1970-01-01T00:00:00.000Z",
            })),
            ...selectedForTarget,
          ]
        : selectedForTarget;
    const trimmed = trimProjectionCandidatesToBudget({
      candidates: selectedForTargetWithPointers,
      maxChars: NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS[target],
    });
    const body = renderProjectionBody({
      title: SHARED_PROJECTION_TITLES[target],
      items: trimmed.kept.map((candidate) => candidate.text),
      omittedCount: trimmed.omittedCount,
    });
    const sync = await syncProjectionFile({
      workspaceDir: params.workspaceDir,
      target: { target },
      body,
      write: params.write,
    });
    results.push({
      ...sync,
      selectedCount: trimmed.kept.length,
      omittedCount: trimmed.omittedCount,
      sourceCount: selectedForTargetWithPointers.length,
      selectedSourceIds: trimmed.kept.map((candidate) => candidate.sourceId),
      omittedSourceIds: trimmed.omitted.map((candidate) => candidate.sourceId),
    });
  }

  return {
    results,
    skipped,
  };
}
