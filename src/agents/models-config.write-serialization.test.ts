import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import {
  CUSTOM_PROXY_MODELS_CONFIG,
  installModelsConfigTestHooks,
  withModelsTempHome,
} from "./models-config.e2e-harness.js";
import { readGeneratedModelsJson } from "./models-config.test-utils.js";

const planOpenClawModelsJsonMock = vi.fn();

installModelsConfigTestHooks();

let ensureOpenClawModelsJson: typeof import("./models-config.js").ensureOpenClawModelsJson;
let resetModelsJsonReadyCacheForTest: typeof import("./models-config.js").resetModelsJsonReadyCacheForTest;

beforeAll(async () => {
  vi.doMock("./models-config.plan.js", () => ({
    planOpenClawModelsJson: (...args: unknown[]) => planOpenClawModelsJsonMock(...args),
  }));
  ({ ensureOpenClawModelsJson, resetModelsJsonReadyCacheForTest } =
    await import("./models-config.js"));
});

beforeEach(() => {
  planOpenClawModelsJsonMock
    .mockReset()
    .mockImplementation(async (params: { cfg?: typeof CUSTOM_PROXY_MODELS_CONFIG }) => ({
      action: "write",
      contents: `${JSON.stringify({ providers: params.cfg?.models?.providers ?? {} }, null, 2)}\n`,
    }));
});

describe("models-config write serialization", () => {
  it("serializes concurrent models.json writes to avoid overlap", async () => {
    await withModelsTempHome(async () => {
      const first = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const second = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const firstModel = first.models?.providers?.["custom-proxy"]?.models?.[0];
      const secondModel = second.models?.providers?.["custom-proxy"]?.models?.[0];
      if (!firstModel || !secondModel) {
        throw new Error("custom-proxy fixture missing expected model entries");
      }
      firstModel.name = "Proxy A";
      secondModel.name = "Proxy B with longer name";

      const originalWriteFile = fs.writeFile.bind(fs);
      let inFlightWrites = 0;
      let maxInFlightWrites = 0;
      const writeSpy = vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
        const targetArg = args[0];
        const targetPath =
          typeof targetArg === "string"
            ? targetArg
            : targetArg instanceof URL
              ? targetArg.pathname
              : undefined;
        const isModelsTempWrite =
          typeof targetPath === "string" &&
          path.basename(targetPath).startsWith("models.json.") &&
          targetPath.endsWith(".tmp");
        if (isModelsTempWrite) {
          inFlightWrites += 1;
          if (inFlightWrites > maxInFlightWrites) {
            maxInFlightWrites = inFlightWrites;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        try {
          return await originalWriteFile(...args);
        } finally {
          if (isModelsTempWrite) {
            inFlightWrites -= 1;
          }
        }
      });

      try {
        await Promise.all([ensureOpenClawModelsJson(first), ensureOpenClawModelsJson(second)]);
      } finally {
        writeSpy.mockRestore();
      }

      expect(maxInFlightWrites).toBe(1);
      const parsed = await readGeneratedModelsJson<{
        providers: { "custom-proxy"?: { models?: Array<{ name?: string }> } };
      }>();
      expect(["Proxy A", "Proxy B with longer name"]).toContain(
        parsed.providers["custom-proxy"]?.models?.[0]?.name,
      );
    });
  }, 60_000);

  it("uses disk readiness after an in-memory cache reset without replanning unchanged models.json", async () => {
    await withModelsTempHome(async () => {
      await ensureOpenClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);
      expect(planOpenClawModelsJsonMock).toHaveBeenCalledTimes(1);

      resetModelsJsonReadyCacheForTest();

      await ensureOpenClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);
      expect(planOpenClawModelsJsonMock).toHaveBeenCalledTimes(1);
    });
  });

  it("reuses an existing models.json before replanning when reuse-existing is requested", async () => {
    await withModelsTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(
        path.join(agentDir, "models.json"),
        `${JSON.stringify(
          {
            providers: {
              "custom-proxy": {
                baseUrl: "http://localhost:4000/v1",
                models: [],
              },
            },
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
      resetModelsJsonReadyCacheForTest();
      planOpenClawModelsJsonMock.mockClear();

      const result = await ensureOpenClawModelsJson({ models: { providers: {} } }, undefined, {
        policy: "reuse-existing",
      });

      expect(result.wrote).toBe(false);
      expect(planOpenClawModelsJsonMock).not.toHaveBeenCalled();
      const parsed = await readGeneratedModelsJson<{
        providers: { "custom-proxy"?: { baseUrl?: string } };
      }>();
      expect(parsed.providers["custom-proxy"]?.baseUrl).toBe("http://localhost:4000/v1");
    });
  });
});
