import { describe, expect, it } from "vitest";
import { getProjectionRegistryEntry, PROJECTION_REGISTRY } from "./registry.ts";

describe("projection registry", () => {
  it("defines the complete v1 projection catalog", () => {
    expect(PROJECTION_REGISTRY.map((entry) => entry.projectionType)).toEqual([
      "user_profile_page",
      "project_page",
      "procedure_page",
      "source_page",
      "decision_log",
      "timeline_page",
      "entity_page",
      "dashboard",
      "agent_digest",
      "projection_digest",
    ]);
  });

  it("requires active MMV2 source ids for retrieval-facing projections", () => {
    for (const entry of PROJECTION_REGISTRY) {
      expect(entry.schemaVersion).toBe("memory_projection.v1");
      expect(entry.sourceRequirements.requireActiveMemoryIds).toBe(true);
      expect(entry.artifactPathPrefix).toContain(".openclaw/model-memory/projections/");
      expect(entry.runtimeUseCase.length).toBeGreaterThan(10);
      expect(entry.selectionHints.length).toBeGreaterThan(0);
      if (entry.machineFacing) {
        expect(entry.artifactOutputs).toContain("json_digest");
      }
    }
  });

  it("looks up registry entries by type", () => {
    expect(getProjectionRegistryEntry("project_page")).toEqual(
      expect.objectContaining({
        projectionType: "project_page",
        retrievalRole: "project_state",
        derivedArtifactRoles: ["read_model", "operator_report", "workspace_bootstrap"],
        generationContextAuthority: "thin_renderer_only",
      }),
    );
  });
});
