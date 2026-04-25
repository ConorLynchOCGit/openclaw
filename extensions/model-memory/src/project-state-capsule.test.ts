import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileProjectStateCapsule,
  createProjectStateCapsuleReader,
  writeProjectStateCapsuleArtifact,
} from "./project-state-capsule.ts";
import { buildRuntimeGraph, type RuntimeGraphMemoryInput } from "./runtime-graph.ts";

const baseMemory = (overrides: Partial<RuntimeGraphMemoryInput> = {}): RuntimeGraphMemoryInput => ({
  memoryId: "mem-current",
  status: "active",
  unitType: "atomic",
  kind: "claim",
  artifactType: null,
  canonicalText: "Project state is captured in MMV2.",
  searchText: "project state mmv2",
  scope: {
    tenant_id: "tenant-1",
    user_id: "user-1",
    project_id: "project-1",
    workspace_id: "workspace-1",
    subject_type: "project",
    subject_id: "project-1",
    applies_to: "current_project",
  },
  payload: { payload_type: "claim", claim_type: "project_fact" },
  validity: {
    valid_at: "2026-04-25T00:00:00.000Z",
    invalid_at: null,
    temporal_status: "current",
  },
  sourceRefs: [
    {
      sourceId: "src-a",
      segmentId: "seg-a",
      sourceType: "document",
      sourceIngestEventId: "evt-a",
    },
  ],
  sourceAuthorityTier: "curated_authoritative",
  sourceProfileId: "curated_corpus",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
  ...overrides,
});

function sectionItems(
  capsule: ReturnType<typeof compileProjectStateCapsule>["capsule"],
  type: string,
) {
  return capsule.sections.find((section) => section.sectionType === type)?.items ?? [];
}

describe("project-state-capsule", () => {
  const now = new Date("2026-04-25T01:00:00.000Z");

  it("compiles deterministic capsule ids, content hashes, and section ids", () => {
    const first = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [baseMemory()],
      now,
    }).capsule;
    const second = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [baseMemory()],
      now,
    }).capsule;

    expect(first.capsuleId).toBe(second.capsuleId);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.sections.map((section) => section.sectionId)).toEqual(
      second.sections.map((section) => section.sectionId),
    );
  });

  it("filters memories by project id and carries source memory ids and refs", () => {
    const result = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({ memoryId: "mem-project" }),
        baseMemory({
          memoryId: "mem-other",
          scope: { ...baseMemory().scope, project_id: "project-2" },
        }),
      ],
      now,
    });

    expect(result.excludedMemoryIds).toEqual([
      { memoryId: "mem-other", reason: "project_scope_mismatch" },
    ]);
    expect(result.capsule.digest.sourceMemoryIds).toEqual(["mem-project"]);
    expect(result.capsule.digest.sourceRefs).toEqual([
      expect.objectContaining({ sourceId: "src-a", segmentId: "seg-a" }),
    ]);
  });

  it("carries authority tiers and source profile ids into digest and sections", () => {
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({
          sourceAuthorityTier: "user_authoritative",
          sourceProfileId: "explicit_user_turn",
        }),
      ],
      now,
    }).capsule;

    expect(capsule.digest.authorityTiers).toEqual(["user_authoritative"]);
    expect(capsule.digest.sourceProfileIds).toEqual(["explicit_user_turn"]);
    expect(sectionItems(capsule, "current_state")).toEqual([
      expect.objectContaining({
        authorityTier: "user_authoritative",
        sourceProfileId: "explicit_user_turn",
        authorityLabel: "authoritative",
      }),
    ]);
  });

  it("routes lower-authority soft-source material into labeled soft-source evidence", () => {
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({
          memoryId: "mem-soft",
          sourceAuthorityTier: "cited_soft",
          sourceProfileId: "cited_assistant_answer",
        }),
        baseMemory({
          memoryId: "mem-tool",
          sourceAuthorityTier: "tool_grounded",
          sourceProfileId: "tool_result_capture",
        }),
      ],
      now,
    }).capsule;

    expect(sectionItems(capsule, "current_state")).toHaveLength(0);
    expect(sectionItems(capsule, "soft_source_evidence")).toEqual([
      expect.objectContaining({
        sourceMemoryIds: ["mem-soft"],
        authorityTier: "cited_soft",
        authorityLabel: "lower_authority",
      }),
      expect.objectContaining({
        sourceMemoryIds: ["mem-tool"],
        authorityTier: "tool_grounded",
        authorityLabel: "lower_authority",
      }),
    ]);
  });

  it("excludes inspection-only and inactive lifecycle material from normal capsule output", () => {
    const result = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({
          memoryId: "mem-inspection",
          sourceAuthorityTier: "inspection_only",
          sourceProfileId: "raw_transcript",
        }),
        baseMemory({ memoryId: "mem-inactive", status: "inactive" }),
        baseMemory({ memoryId: "mem-superseded", status: "superseded" }),
        baseMemory({ memoryId: "mem-deleted", status: "deleted" }),
      ],
      now,
    });

    expect(result.capsule.digest.sourceMemoryIds).toEqual([]);
    expect(result.excludedMemoryIds).toEqual([
      { memoryId: "mem-deleted", reason: "deleted" },
      { memoryId: "mem-inactive", reason: "inactive" },
      { memoryId: "mem-inspection", reason: "inspection_only" },
      { memoryId: "mem-superseded", reason: "superseded" },
    ]);
  });

  it("marks capsule stale when project-scoped source memories are stale", () => {
    const result = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({
          memoryId: "mem-stale",
          validity: {
            valid_at: "2026-04-01T00:00:00.000Z",
            invalid_at: "2026-04-02T00:00:00.000Z",
            temporal_status: "historical",
          },
        }),
      ],
      now,
    });

    expect(result.excludedMemoryIds).toEqual([{ memoryId: "mem-stale", reason: "stale" }]);
    expect(result.capsule.digest.freshness).toEqual({
      status: "stale",
      reason: "one or more project-scoped source memories were stale",
    });
    expect(result.capsule.digest.conflictMarkers).toEqual(["stale:mem-stale"]);
  });

  it("routes conflicted material into the conflicts section", () => {
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({
          memoryId: "mem-conflict",
          status: "conflicted",
          lineage: { conflictsWithMemoryIds: ["mem-other"] },
        }),
      ],
      now,
    }).capsule;

    expect(sectionItems(capsule, "current_state")).toHaveLength(0);
    expect(sectionItems(capsule, "conflicts")).toEqual([
      expect.objectContaining({
        sourceMemoryIds: ["mem-conflict"],
        conflictMarkers: ["mem-conflict", "mem-other"],
      }),
    ]);
    expect(capsule.digest.conflictMarkers).toEqual(["mem-conflict", "mem-other"]);
  });

  it("routes authoritative structural memories into v1 project-state sections", () => {
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [
        baseMemory({
          memoryId: "mem-decision",
          payload: { payload_type: "claim", claim_type: "decision" },
        }),
        baseMemory({
          memoryId: "mem-directive",
          kind: "directive",
          payload: { payload_type: "directive", directive_type: "project_rule" },
        }),
        baseMemory({
          memoryId: "mem-procedure",
          artifactType: "procedure",
          payload: { payload_type: "artifact" },
        }),
        baseMemory({
          memoryId: "mem-ref",
          kind: "source_ref",
          payload: { payload_type: "source_ref" },
        }),
        baseMemory({
          memoryId: "mem-question",
          payload: { payload_type: "claim", open_question: true },
        }),
      ],
      now,
    }).capsule;

    expect(sectionItems(capsule, "active_decisions")).toHaveLength(1);
    expect(sectionItems(capsule, "active_constraints")).toHaveLength(1);
    expect(sectionItems(capsule, "procedures")).toHaveLength(1);
    expect(sectionItems(capsule, "references")).toHaveLength(1);
    expect(sectionItems(capsule, "open_questions")).toHaveLength(1);
  });

  it("references graph node and edge ids when graph input is supplied", () => {
    const memories = [
      baseMemory({ memoryId: "mem-a" }),
      baseMemory({
        memoryId: "mem-b",
        lineage: { derivedFromMemoryIds: ["mem-a"] },
      }),
    ];
    const graph = buildRuntimeGraph(memories, { now });
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories,
      graph,
      now,
    }).capsule;

    expect(capsule.digest.graphNodeIds.length).toBeGreaterThan(0);
    expect(capsule.digest.graphEdgeIds.length).toBeGreaterThan(0);
    expect(sectionItems(capsule, "current_state")[0]).toMatchObject({
      graphNodeIds: expect.arrayContaining([expect.any(String)]),
      graphEdgeIds: expect.arrayContaining([expect.any(String)]),
    });
  });

  it("exposes a read-only capsule lookup seam", () => {
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [baseMemory()],
      now,
    }).capsule;
    const reader = createProjectStateCapsuleReader([capsule]);
    const snapshot = reader.snapshot();
    snapshot[0].sections.length = 0;

    expect(reader.getByProjectId("project-1")?.capsuleId).toBe(capsule.capsuleId);
    expect(reader.getByCapsuleId(capsule.capsuleId)?.projectId).toBe("project-1");
    expect(reader.snapshot()[0].sections.length).toBe(capsule.sections.length);
  });

  it("writes bounded derived JSON capsule artifacts", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-state-capsule-"));
    const capsule = compileProjectStateCapsule({
      projectId: "project-1",
      memories: [baseMemory()],
      now,
    }).capsule;

    const written = await writeProjectStateCapsuleArtifact({
      artifactDir,
      artifactId: "project 1",
      capsule,
    });

    expect(path.basename(written.path)).toBe("project-1.project-state-capsule.json");
    expect(written.contentHash).toHaveLength(64);
    const serialized = await fs.readFile(written.path, "utf8");
    expect(JSON.parse(serialized)).toMatchObject({
      schemaVersion: "project_state_capsule.v1",
      capsuleType: "project_state",
      projectId: "project-1",
    });
    expect(serialized).not.toContain("raw_prompt");
    expect(serialized).not.toContain("raw_tool_log");
  });
});
