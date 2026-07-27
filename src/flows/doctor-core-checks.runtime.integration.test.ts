// Doctor integration proof: consume one real native MCP catalog without loading unrelated plugins.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeBundleProbeMcpServer } from "../agents/bundle-mcp-shared.test-harness.js";

vi.mock("../agents/agent-tools.js", () => ({
  createOpenClawCodingTools: () => [],
}));

vi.mock("../agents/model-catalog.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/model-catalog.js")>()),
  loadModelCatalog: async () => [
    {
      provider: "openai",
      id: "gpt-5.5",
      name: "GPT-5.5",
      api: "openai-responses",
      contextWindow: 200_000,
      compat: { supportsTools: true },
    },
  ],
}));

vi.mock("../plugins/provider-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugins/provider-runtime.js")>()),
  inspectProviderToolSchemasWithPlugin: () => [],
  normalizeProviderToolSchemasWithPlugin: ({ context }: { context: { tools: unknown[] } }) =>
    context.tools,
}));

const { collectRuntimeToolSchemaFindings } = await import("./doctor-core-checks.runtime.js");

const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempDirs].map(async (tempDir) => {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDirs.delete(tempDir);
    }),
  );
});

describe("doctor runtime tool schemas with native MCP", () => {
  it("accepts a valid dynamically listed tool through the real MCP runtime", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-native-mcp-"));
    tempDirs.add(tempDir);
    const serverPath = path.join(tempDir, "server.mjs");
    await writeBundleProbeMcpServer(serverPath);

    const findings = await collectRuntimeToolSchemaFindings({
      plugins: { enabled: false },
      agents: {
        entries: { main: { default: true, workspace: tempDir } },
      },
      mcp: {
        servers: {
          probe: {
            command: process.execPath,
            args: [serverPath],
          },
        },
      },
    });

    expect(findings).toEqual([]);
  });

  it("projects a missing exact MCP tool selection from the native catalog", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-native-mcp-missing-"));
    tempDirs.add(tempDir);
    const serverPath = path.join(tempDir, "server.mjs");
    await writeBundleProbeMcpServer(serverPath);

    const findings = await collectRuntimeToolSchemaFindings({
      plugins: { enabled: false },
      agents: {
        entries: { main: { default: true, workspace: tempDir } },
      },
      mcp: {
        servers: {
          probe: {
            command: process.execPath,
            args: [serverPath],
            toolFilter: {
              include: ["missing_probe"],
            },
          },
        },
      },
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        checkId: "core/doctor/runtime-tool-schemas",
        path: "mcp.servers.probe",
        requirement:
          'Configured toolFilter.include entry "missing_probe" was not returned by MCP tools/list.',
      }),
    );
  });
});
