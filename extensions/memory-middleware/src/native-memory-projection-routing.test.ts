import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryObjectRecord } from "./db/runtime.js";
import {
  classifyAgentWorkspaceProjectionTargets,
  discoverSiblingAgentWorkspaceTargets,
  discoverWorkspaceProjectProjectionTargets,
  resolveProjectionAgentKey,
  resolveProjectProjectionTarget,
} from "./native-memory-projection-routing.js";

function createRecord(overrides: Partial<MemoryObjectRecord> = {}): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "project",
    reviewState: "approved",
    content: "Project fact [Maintenance]: run the daily audit first.",
    updatedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T03:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("native memory projection routing", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-native-routing-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("matches project-scoped records to real workspace project folders", async () => {
    await fs.mkdir(path.join(tmpDir, "projects", "maintenance"), { recursive: true });
    const targets = await discoverWorkspaceProjectProjectionTargets(tmpDir);
    const target = resolveProjectProjectionTarget(
      createRecord({
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              subject: "Maintenance / audit order",
              statement: "Run the daily audit first",
              facets: {
                projectScope: "maintenance",
              },
              tags: ["project_fact"],
            },
          },
        },
      }),
      targets,
    );

    expect(target?.slug).toBe("maintenance");
  });

  it("extracts agent applicability from canonical metadata", () => {
    expect(
      resolveProjectionAgentKey(
        createRecord({
          memoryKind: "feedback",
          metadata: {
            candidateMetadata: {
              autoCapture: {
                agentExternalKey: "x-manager",
              },
            },
          },
        }),
      ),
    ).toBe("x-manager");
  });

  it("classifies specialized and generic agent workspaces from live-style files", async () => {
    const sharedDir = path.join(tmpDir, "shared");
    const genericDir = path.join(tmpDir, "builder");
    const specializedDir = path.join(tmpDir, "x-manager");
    await fs.mkdir(sharedDir, { recursive: true });
    await fs.mkdir(genericDir, { recursive: true });
    await fs.mkdir(specializedDir, { recursive: true });
    await fs.writeFile(
      path.join(genericDir, "AGENTS.md"),
      "# AGENTS.md - Your Workspace\n",
      "utf-8",
    );
    await fs.writeFile(path.join(specializedDir, "AGENTS.md"), "# X Manager Workspace\n", "utf-8");

    const classifications = await classifyAgentWorkspaceProjectionTargets({
      sharedWorkspaceDir: sharedDir,
      agentWorkspaces: [
        { agentKey: "main", workspaceDir: sharedDir },
        { agentKey: "builder", workspaceDir: genericDir },
        { agentKey: "x-manager", workspaceDir: specializedDir },
      ],
    });

    expect(classifications).toEqual([
      { agentKey: "builder", workspaceDir: genericDir, kind: "generic" },
      { agentKey: "main", workspaceDir: sharedDir, kind: "shared" },
      { agentKey: "x-manager", workspaceDir: specializedDir, kind: "specialized" },
    ]);
  });

  it("discovers sibling agent workspaces next to the shared workspace", async () => {
    const sharedDir = path.join(tmpDir, "workspace");
    const agentsDir = path.join(tmpDir, "agent-workspaces");
    await fs.mkdir(sharedDir, { recursive: true });
    await fs.mkdir(path.join(agentsDir, "x-manager"), { recursive: true });
    await fs.mkdir(path.join(agentsDir, "web-researcher"), { recursive: true });

    await expect(discoverSiblingAgentWorkspaceTargets(sharedDir)).resolves.toEqual([
      { agentKey: "web-researcher", workspaceDir: path.join(agentsDir, "web-researcher") },
      { agentKey: "x-manager", workspaceDir: path.join(agentsDir, "x-manager") },
    ]);
  });
});
