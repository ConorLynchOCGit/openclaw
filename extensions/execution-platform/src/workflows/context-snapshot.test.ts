import { describe, expect, it } from "vitest";
import {
  createContextSnapshotRef,
  deriveContextSnapshotRefsFromArtifactRefs,
  validateContextSnapshotFreshness,
} from "./context-snapshot.ts";

describe("context snapshot refs", () => {
  it("validates fresh bounded context snapshots structurally", () => {
    const ref = createContextSnapshotRef({
      sourceRef: "openclaw-session://agent%3Aexecution-context-scout%3Anode%3Arun/result/1",
      sourceKind: "native_context_scout_result",
      repoRevision: "rev-a",
      sourcePromptHash: "prompt-a",
      sourcePayloadHash: "payload-a",
      commitmentIds: ["commitment-1"],
      scopeSummary: "Native context scout result for commitment 1.",
    });

    const validation = validateContextSnapshotFreshness({
      requiredRefs: [ref],
      providedRefs: [ref],
      currentRepoRevision: "rev-a",
      sourcePromptHash: "prompt-a",
      sourcePayloadHash: "payload-a",
    });

    expect(validation.valid).toBe(true);
    expect(validation.freshnessStatus).toBe("fresh");
    expect(validation.freshRefs).toEqual([ref.snapshotRef]);
    expect(ref.rawPromptStored).toBe(false);
    expect(ref.rawProviderLogStored).toBe(false);
  });

  it("blocks stale repo revisions without semantic judgment", () => {
    const ref = createContextSnapshotRef({
      sourceRef: "runtime-job://job/resource-ledger/entry-1",
      sourceKind: "memory_context_pack",
      repoRevision: "rev-old",
      sourcePromptHash: "prompt-a",
      scopeSummary: "Accepted node-local context ledger entry.",
    });

    const validation = validateContextSnapshotFreshness({
      requiredRefs: [ref],
      providedRefs: [ref],
      currentRepoRevision: "rev-new",
      sourcePromptHash: "prompt-a",
    });

    expect(validation.valid).toBe(false);
    expect(validation.freshnessStatus).toBe("stale");
    expect(validation.reasonCodes).toContain(
      `context_snapshot_repo_revision_mismatch:${ref.snapshotRef}`,
    );
  });

  it("derives bounded snapshot refs from artifact refs", () => {
    const refs = deriveContextSnapshotRefsFromArtifactRefs({
      artifactRefs: [
        "openclaw-session://agent%3Aexecution-context-scout%3Anode%3Arun/result/a",
        "openclaw-session://agent%3Aexecution-context-scout%3Anode%3Arun/result/a",
      ],
      sourceKind: "native_context_scout_result",
      commitmentIds: ["commitment-1"],
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]?.sourceKind).toBe("native_context_scout_result");
    expect(refs[0]?.commitmentIds).toEqual(["commitment-1"]);
  });
});
