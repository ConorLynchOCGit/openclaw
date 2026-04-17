import { describe, expect, it } from "vitest";
import {
  assembleBootstrapCompatibilityContent,
  type BootstrapCanonicalSources,
} from "./bootstrap-canonicalization.js";

const canonicalSources: BootstrapCanonicalSources = {
  activeProjects: [
    {
      title: "Workspace Topology",
      workspacePath: "docs/projects/workspace-topology",
      startupPath: "docs/projects/workspace-topology/STARTUP.md",
      currentSlicePath: "docs/projects/workspace-topology/CURRENT_SLICE.md",
      statusPath: "docs/projects/workspace-topology/STATUS.md",
    },
    {
      title: "Model Memory",
      workspacePath: "docs/projects/model-memory",
      startupPath: "docs/projects/model-memory/STARTUP.md",
      currentSlicePath: "docs/projects/model-memory/CURRENT_SLICE.md",
      statusPath: "docs/projects/model-memory/STATUS.md",
    },
    {
      title: "Deployment Topology",
      workspacePath: "docs/projects/deployment-topology",
      startupPath: "docs/projects/deployment-topology/STARTUP.md",
      currentSlicePath: "docs/projects/deployment-topology/CURRENT_SLICE.md",
      statusPath: "docs/projects/deployment-topology/STATUS.md",
    },
  ],
  queuedProjects: [
    {
      title: "Agent Foundation",
      workspacePath: "docs/projects/agent-foundation",
      startupPath: "docs/projects/agent-foundation/STARTUP.md",
      currentSlicePath: "docs/projects/agent-foundation/CURRENT_SLICE.md",
      statusPath: "docs/projects/agent-foundation/STATUS.md",
    },
  ],
  agentRules: [
    "AGENTS.md must remain a runtime-facing operational document rather than a shallow pointer page",
    "durable sources and runtime compatibility files must be mapped explicitly",
  ],
  memoryRules: [
    "runtime-facing `MEMORY.md` remains a memory artifact, not a pointer file",
    "DB-backed `model-memory` projections remain part of the architecture",
  ],
  memoryLayers: [
    "durable human-owned memory-bearing sources",
    "DB-backed `model-memory` generative projection",
    "daily memory files as episodic and ingestion layer",
  ],
};

describe("assembleBootstrapCompatibilityContent", () => {
  it("preserves rich AGENTS sections while adding the canonical durable block", () => {
    const content = assembleBootstrapCompatibilityContent({
      fileName: "AGENTS.md",
      filePath: "AGENTS.md",
      existingContent: [
        "# AGENTS.md",
        "",
        "## Session Startup",
        "- read startup context",
        "",
        "## Red Lines",
        "- do not exfiltrate data",
      ].join("\n"),
      registryEntry: {
        id: "agents_md",
        runtimePath: "AGENTS.md",
        structuralMode: "rich_operational_document",
        currentOwnership: "runtime_primary_transitional",
        targetOwnership: "canonical_derived_compatibility_artifact",
        projectionMode: "assembled_document_with_stable_sections",
        seedMode: "bootstrap_materialized",
        seedTiming: "startup",
        canonicalSourceClass: ["docs_system", "docs_agents", "docs_projects"],
      },
      canonicalSources,
    });

    expect(content).toContain("## Session Startup");
    expect(content).toContain("## Red Lines");
    expect(content).toContain("<!-- BEGIN GENERATED: openclaw-canonical -->");
    expect(content).toContain("Active durable project workspace: Workspace Topology");
    expect(content).toContain("current slice docs/projects/workspace-topology/CURRENT_SLICE.md");
  });

  it("assembles MEMORY.md with both model-memory output and the generated pointer layer", () => {
    const content = assembleBootstrapCompatibilityContent({
      fileName: "MEMORY.md",
      filePath: "MEMORY.md",
      existingContent: ["# MEMORY.md", "", "## Human Notes", "- keep this around"].join("\n"),
      registryEntry: {
        id: "memory_md",
        runtimePath: "MEMORY.md",
        structuralMode: "runtime_memory_artifact",
        currentOwnership: "mixed_durable_and_generated",
        targetOwnership: "canonical_derived_compatibility_artifact",
        projectionMode: "generated_or_assembled_memory_artifact",
        seedMode: "bootstrap_materialized",
        seedTiming: "startup",
        canonicalSourceClass: [
          "docs_system",
          "docs_projects",
          "docs_agents",
          "generated_memory_projection",
        ],
      },
      canonicalSources,
      projectionText: [
        "# MEMORY.md",
        "",
        "## Standing Context",
        "- deployment region: region-001",
      ].join("\n"),
      projectionVersion: {
        id: "projection-memory-v1",
        targetId: "memory-md",
        contentHash: "hash-001",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash-001.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 12,
        builtAt: new Date(0),
      },
    });

    expect(content).toContain("<!-- BEGIN GENERATED: model-memory -->");
    expect(content).toContain("## Standing Context");
    expect(content).toContain("<!-- BEGIN GENERATED: openclaw-canonical -->");
    expect(content).toContain("## Workspace Recall Index");
    expect(content).toContain("Read first: docs/system/roadmap.md");
    expect(content).toContain("Active workspace: Workspace Topology");
    expect(content).toContain("Queued workspace: Agent Foundation");
    expect(content).toContain("## User-Facing Scheduled Flows");
    expect(content).toContain("Automation overview: docs/automation/index.md");
    expect(content).toContain("Scheduled tasks: docs/automation/cron-jobs.md");
    expect(content).toContain("Heartbeat: docs/gateway/heartbeat.md");
    expect(content).toContain(
      "DB-backed generated memory projection: .openclaw/model-memory/projections/memory-md-hash-001.md",
    );
    expect(content).toContain("Daily memory ingestion layer: memory/YYYY-MM-DD.md");
    expect(content.indexOf("<!-- BEGIN GENERATED: model-memory -->")).toBeLessThan(
      content.indexOf("## Human Notes"),
    );
    expect(content.indexOf("<!-- BEGIN GENERATED: openclaw-canonical -->")).toBeLessThan(
      content.indexOf("## Human Notes"),
    );
  });
});
