import type { NativeMemoryProjectionScopeKind } from "./native-memory-projection-scope.js";

type ProjectionAuditResult = {
  relPath: string;
  changed: boolean;
  changeKind: string;
  generatedChars: number;
  budgetChars: number;
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
    totalTargets: number;
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

function formatTargetLine(target: NativeMemoryProjectionAuditTarget): string {
  const lanePrefix =
    target.lane === "project"
      ? `project:${target.projectSlug ?? "unknown"}`
      : target.lane === "agent"
        ? `agent:${target.agentKey ?? "unknown"}`
        : "shared";
  const changeLabel = target.changed ? target.changeKind : "unchanged";
  return `- ${lanePrefix} ${target.relPath}: ${changeLabel}; selected ${String(target.selectedCount)}/${String(target.sourceCount)}; omitted ${String(target.omittedCount)}; chars ${String(target.generatedChars)}/${String(target.budgetChars)}`;
}

function summarizeReasons(
  entries: Array<{ reason: string }>,
): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

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
      totalTargets: targets.length,
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

export function renderNativeMemoryProjectionOperatorSummary(
  report: NativeMemoryProjectionAuditReport,
): string {
  const lines = [
    "# Native Memory Projection Summary",
    "",
    `- changed_targets: ${String(report.summary.changedTargets)}/${String(report.summary.totalTargets)}`,
    `- selected_entries: ${String(report.summary.selectedEntries)}`,
    `- omitted_entries: ${String(report.summary.omittedEntries)}`,
    `- skipped_records: ${String(report.summary.skippedRecords)}`,
    `- unmatched_records: ${String(report.summary.unmatchedRecords)}`,
    `- recovered_partial_blocks: ${String(report.summary.recoveredPartialBlocks)}`,
  ];

  if (report.targets.length > 0) {
    lines.push("", "## Destinations", "", ...report.targets.map(formatTargetLine));
  }

  const omittedTargets = report.targets.filter((target) => target.omittedCount > 0);
  if (omittedTargets.length > 0) {
    lines.push(
      "",
      "## Omitted By Budget",
      "",
      ...omittedTargets.map(
        (target) =>
          `- ${target.relPath}: ${String(target.omittedCount)} omitted within ${String(target.generatedChars)}/${String(target.budgetChars)} chars`,
      ),
    );
  }

  if (report.skipped.length > 0) {
    lines.push(
      "",
      "## Skipped Records",
      "",
      ...summarizeReasons(report.skipped).map(
        ({ reason, count }) => `- ${reason}: ${String(count)}`,
      ),
    );
  }

  if (report.unmatched.length > 0) {
    lines.push(
      "",
      "## Unmatched Records",
      "",
      ...summarizeReasons(report.unmatched).map(
        ({ reason, count }) => `- ${reason}: ${String(count)}`,
      ),
    );
  }

  return lines.join("\n");
}
