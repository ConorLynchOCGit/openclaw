import type { NativeMemoryProjectionScopeKind } from "./native-memory-projection-scope.js";

type ProjectionAuditResult = {
  relPath: string;
  changed: boolean;
  changeKind: string;
  sourceCount: number;
  selectedCount: number;
  omittedCount: number;
  selectedSourceIds: string[];
  omittedSourceIds: string[];
};

export type NativeMemoryProjectionSkippedRecord = {
  sourceId: string;
  reason: string;
  scopeKind?: NativeMemoryProjectionScopeKind;
  agentKey?: string;
};

export type NativeMemoryProjectionAuditTarget = ProjectionAuditResult & {
  lane: "shared" | "project" | "agent";
  target: string;
  projectSlug?: string;
  agentKey?: string;
  workspaceKind?: "shared" | "generic" | "specialized";
};

export type NativeMemoryProjectionAuditReport = {
  summary: {
    changedTargets: number;
    omittedEntries: number;
    selectedEntries: number;
    skippedRecords: number;
    unmatchedRecords: number;
    recoveredPartialBlocks: number;
  };
  targets: NativeMemoryProjectionAuditTarget[];
  skipped: NativeMemoryProjectionSkippedRecord[];
  unmatched: Array<{ sourceId: string; reason: string }>;
};

export function buildNativeMemoryProjectionAuditReport(params: {
  shared?: NativeMemoryProjectionAuditTarget[];
  projects?: NativeMemoryProjectionAuditTarget[];
  agents?: NativeMemoryProjectionAuditTarget[];
  skipped?: NativeMemoryProjectionSkippedRecord[];
  unmatched?: Array<{ sourceId: string; reason: string }>;
}): NativeMemoryProjectionAuditReport {
  const targets = [...(params.shared ?? []), ...(params.projects ?? []), ...(params.agents ?? [])];
  return {
    summary: {
      changedTargets: targets.filter((target) => target.changed).length,
      omittedEntries: targets.reduce((sum, target) => sum + target.omittedCount, 0),
      selectedEntries: targets.reduce((sum, target) => sum + target.selectedCount, 0),
      skippedRecords: params.skipped?.length ?? 0,
      unmatchedRecords: params.unmatched?.length ?? 0,
      recoveredPartialBlocks: targets.filter(
        (target) => target.changeKind === "recovered_partial_block",
      ).length,
    },
    targets,
    skipped: params.skipped ?? [],
    unmatched: params.unmatched ?? [],
  };
}
