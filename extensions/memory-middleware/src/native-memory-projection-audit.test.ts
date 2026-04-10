import { describe, expect, it } from "vitest";
import {
  buildNativeMemoryProjectionAuditReport,
  renderNativeMemoryProjectionOperatorSummary,
} from "./native-memory-projection-audit.js";

describe("native memory projection audit", () => {
  it("summarizes changed targets, omissions, skips, and recovered drift", () => {
    const report = buildNativeMemoryProjectionAuditReport({
      shared: [
        {
          lane: "shared",
          target: "user-profile",
          relPath: "USER.md",
          changed: true,
          changeKind: "recovered_partial_block",
          generatedChars: 120,
          budgetChars: 2400,
          sourceCount: 2,
          selectedCount: 1,
          omittedCount: 1,
          selectedSourceIds: ["user-1"],
          omittedSourceIds: ["user-2"],
        },
      ],
      projects: [
        {
          lane: "project",
          target: "project-memory-digest",
          projectSlug: "maintenance",
          relPath: "projects/maintenance/MEMORY.md",
          changed: false,
          changeKind: "unchanged",
          generatedChars: 98,
          budgetChars: 3200,
          sourceCount: 1,
          selectedCount: 1,
          omittedCount: 0,
          selectedSourceIds: ["project-1"],
          omittedSourceIds: [],
        },
      ],
      skipped: [{ sourceId: "feedback-2", reason: "scope_filtered", scopeKind: "agent" }],
      unmatched: [{ sourceId: "project-2", reason: "no_workspace_project_target" }],
    });

    expect(report.summary).toEqual({
      changedTargets: 1,
      totalTargets: 2,
      omittedEntries: 1,
      selectedEntries: 2,
      skippedRecords: 1,
      unmatchedRecords: 1,
      recoveredPartialBlocks: 1,
    });

    expect(renderNativeMemoryProjectionOperatorSummary(report)).toContain("changed_targets: 1/2");
    expect(renderNativeMemoryProjectionOperatorSummary(report)).toContain(
      "shared USER.md: recovered_partial_block; selected 1/2; omitted 1; chars 120/2400",
    );
    expect(renderNativeMemoryProjectionOperatorSummary(report)).toContain(
      "no_workspace_project_target",
    );
  });
});
