import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePluginTools } from "./tools.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("model-memory document ingestion tool surface", () => {
  it("resolves the clean-room ingestion tool through the OpenClaw plugin registry", async () => {
    const tools = resolvePluginTools({
      context: {
        config: {
          plugins: {
            enabled: true,
            allow: ["model-memory"],
            load: {
              paths: [path.join(repoRoot, "extensions", "model-memory")],
            },
            entries: {
              "model-memory": {
                enabled: true,
              },
            },
          },
        },
        workspaceDir: repoRoot,
        sandboxed: false,
      } as never,
      toolAllowlist: ["model-memory"],
    });

    const tool = tools.find((entry) => entry.name === "model_memory_document_ingest");
    expect(tool).toBeDefined();
    await expect(
      tool?.execute("tool-call-1", {
        sources: ["../outside.md"],
      }),
    ).rejects.toThrow(/escapes workspace root/i);
  });
});
