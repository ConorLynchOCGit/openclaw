import type { MemoryMiddlewareDb } from "./db/runtime.js";
import type { MemoryObjectRecord } from "./db/runtime.js";
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
}): Promise<SharedProjectionCompilationResult[]> {
  const records = await loadApprovedSharedProjectionRecords({
    db: params.db,
    limitPerKind: params.limitPerKind ?? 80,
  });
  const candidates = buildNativeMemoryProjectionCandidates(records);
  const targets: SharedBootstrapProjectionTarget[] = [
    "user-profile",
    "tool-preferences",
    "memory-digest",
  ];

  const results: SharedProjectionCompilationResult[] = [];
  for (const target of targets) {
    const selectedForTarget = candidates.filter((candidate) => candidate.target === target);
    const trimmed = trimProjectionCandidatesToBudget({
      candidates: selectedForTarget,
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
      sourceCount: selectedForTarget.length,
    });
  }

  return results;
}
