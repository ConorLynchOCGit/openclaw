import { describe, expect, it } from "vitest";
import { buildWorkspaceNotesForAttempt } from "./attempt.prompt-helpers.js";

describe("buildWorkspaceNotesForAttempt", () => {
  it("adds the workspace reminder when workspace bootstrap files are present", () => {
    const notes = buildWorkspaceNotesForAttempt({
      hasWorkspaceBootstrapFile: true,
      bootstrapAnalysis: { hasTruncation: false },
      mainMemoryRouting: {
        sourceResolution: {
          questionKind: "continuity",
          authoritativeSource: "workspace_continuity",
          coverageRequirement: "not_required",
          coverageState: "not_required",
        },
      },
    });

    expect(notes).toEqual(["Reminder: commit your changes in this workspace after edits."]);
  });

  it("adds mounted source-of-truth guidance for source-truth lookups", () => {
    const notes = buildWorkspaceNotesForAttempt({
      hasWorkspaceBootstrapFile: false,
      bootstrapAnalysis: { hasTruncation: false },
      mainMemoryRouting: {
        sourceResolution: {
          questionKind: "implementation",
          authoritativeSource: "repo_canonical_doc",
          coverageRequirement: "verify_before_exact_answer",
          coverageState: "unread",
        },
      },
    });

    expect(notes).toEqual([
      "This turn needs canonical implementation truth. Treat `repo_canonical_doc` under `imports/*/content/...` as authoritative and use workspace memory only as continuity or supporting context.",
      "Exact answers are coverage-gated for this turn. If canonical source coverage is still unread or partial, continue reading until verified or explicitly say coverage is incomplete instead of answering with certainty.",
    ]);
  });

  it("adds a truncation note when bootstrap context was clipped", () => {
    const notes = buildWorkspaceNotesForAttempt({
      hasWorkspaceBootstrapFile: false,
      bootstrapAnalysis: { hasTruncation: true },
      mainMemoryRouting: {
        sourceResolution: {
          questionKind: "continuity",
          authoritativeSource: "workspace_continuity",
          coverageRequirement: "not_required",
          coverageState: "not_required",
        },
      },
    });

    expect(notes).toEqual([
      "Project Context was truncated in bootstrap for this run. Treat injected workspace context as partial and read authoritative files directly before answering exact repo-coupled questions.",
    ]);
  });
});
