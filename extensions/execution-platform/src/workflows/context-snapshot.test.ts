import { describe, expect, it } from "vitest";
import {
  createContextSnapshotRef,
  deriveContextSnapshotRefsFromArtifactRefs,
  validateContextSnapshotFreshness,
} from "./context-snapshot.ts";

describe("context snapshot refs", () => {
  it("validates fresh bounded context snapshots structurally", () => {
    const ref = createContextSnapshotRef({
      sourceRef: "runtime-job://job/resource-handoff/packet-1",
      sourceKind: "resource_scout_handoff",
      repoRevision: "rev-a",
      sourcePromptHash: "prompt-a",
      sourcePayloadHash: "payload-a",
      commitmentIds: ["commitment-1"],
      scopeSummary: "resource scout handoff for commitment 1.",
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
      artifactRefs: ["runtime-job://job/resource-handoff/a", "runtime-job://job/resource-handoff/a"],
      sourceKind: "resource_scout_handoff",
      commitmentIds: ["commitment-1"],
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]?.sourceKind).toBe("resource_scout_handoff");
    expect(refs[0]?.commitmentIds).toEqual(["commitment-1"]);
  });
});
