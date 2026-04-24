import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { getPluginToolMeta } from "../plugins/tools.js";
import { resolveOpenClawPluginToolsForOptions } from "./openclaw-plugin-tools.js";

const hoisted = vi.hoisted(() => ({
  resolvePluginTools: vi.fn(),
  pluginToolMetaByTool: new Map<
    object,
    {
      pluginId: string;
      optional: boolean;
    }
  >(),
  getPluginToolMeta(tool: object) {
    return hoisted.pluginToolMetaByTool.get(tool);
  },
  copyPluginToolMeta(source: object, target: object) {
    const meta = hoisted.pluginToolMetaByTool.get(source);
    if (meta) {
      hoisted.pluginToolMetaByTool.set(target, meta);
    }
  },
}));

vi.mock("../plugins/tools.js", () => ({
  resolvePluginTools: (...args: unknown[]) => hoisted.resolvePluginTools(...args),
  getPluginToolMeta: (tool: object) => hoisted.getPluginToolMeta(tool),
  copyPluginToolMeta: (source: object, target: object) =>
    hoisted.copyPluginToolMeta(source, target),
}));

describe("createOpenClawTools browser plugin integration", () => {
  afterEach(() => {
    hoisted.resolvePluginTools.mockReset();
    hoisted.pluginToolMetaByTool.clear();
    delete process.env.MODEL_MEMORY_LEGACY_MEMORY_TOOLS_ENABLED;
  });

  it("keeps the browser tool returned by plugin resolution", () => {
    hoisted.resolvePluginTools.mockReturnValue([
      {
        name: "browser",
        description: "browser fixture tool",
        parameters: {
          type: "object",
          properties: {},
        },
        async execute() {
          return {
            content: [{ type: "text", text: "ok" }],
          };
        },
      },
    ]);

    const config = {
      plugins: {
        allow: ["browser"],
      },
    } as OpenClawConfig;

    const tools = resolveOpenClawPluginToolsForOptions({
      options: { config },
      resolvedConfig: config,
    });

    expect(tools.map((tool) => tool.name)).toContain("browser");
  });

  it("omits the browser tool when plugin resolution returns no browser tool", () => {
    hoisted.resolvePluginTools.mockReturnValue([]);

    const config = {
      plugins: {
        allow: ["browser"],
        entries: {
          browser: {
            enabled: false,
          },
        },
      },
    } as OpenClawConfig;

    const tools = resolveOpenClawPluginToolsForOptions({
      options: { config },
      resolvedConfig: config,
    });

    expect(tools.map((tool) => tool.name)).not.toContain("browser");
  });

  it("forwards fsPolicy into plugin tool context", async () => {
    let capturedContext: { fsPolicy?: { workspaceOnly: boolean } } | undefined;
    hoisted.resolvePluginTools.mockImplementation((params: unknown) => {
      const resolvedParams = params as { context?: { fsPolicy?: { workspaceOnly: boolean } } };
      capturedContext = resolvedParams.context;
      return [
        {
          name: "browser",
          description: "browser fixture tool",
          parameters: {
            type: "object",
            properties: {},
          },
          async execute() {
            return {
              content: [{ type: "text", text: "ok" }],
              details: { workspaceOnly: capturedContext?.fsPolicy?.workspaceOnly ?? null },
            };
          },
        },
      ];
    });

    const tools = resolveOpenClawPluginToolsForOptions({
      options: {
        config: {
          plugins: {
            allow: ["browser"],
          },
        } as OpenClawConfig,
        fsPolicy: { workspaceOnly: true },
      },
      resolvedConfig: {
        plugins: {
          allow: ["browser"],
        },
      } as OpenClawConfig,
    });

    const browserTool = tools.find((tool) => tool.name === "browser");
    expect(browserTool).toBeDefined();
    if (!browserTool) {
      throw new Error("expected browser tool");
    }

    const result = await browserTool.execute("tool-call", {});
    const details = (result.details ?? {}) as { workspaceOnly?: boolean | null };
    expect(details.workspaceOnly).toBe(true);
  });

  it("adds MMV2 compatibility aliases for memory_search and memory_get", () => {
    const modelMemorySearch = {
      name: "model_memory_search",
      description: "search MMV2",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "search" }] };
      },
    };
    const modelMemoryGet = {
      name: "model_memory_get",
      description: "get MMV2",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "get" }] };
      },
    };
    hoisted.pluginToolMetaByTool.set(modelMemorySearch, {
      pluginId: "model-memory",
      optional: true,
    });
    hoisted.pluginToolMetaByTool.set(modelMemoryGet, {
      pluginId: "model-memory",
      optional: true,
    });
    hoisted.resolvePluginTools.mockReturnValue([modelMemorySearch, modelMemoryGet]);

    const tools = resolveOpenClawPluginToolsForOptions({
      options: { config: {} as OpenClawConfig },
      resolvedConfig: {} as OpenClawConfig,
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "model_memory_search",
      "model_memory_get",
      "memory_search",
      "memory_get",
    ]);
    expect(getPluginToolMeta(tools.find((tool) => tool.name === "memory_search")!)).toMatchObject({
      pluginId: "model-memory",
    });
    expect(getPluginToolMeta(tools.find((tool) => tool.name === "memory_get")!)).toMatchObject({
      pluginId: "model-memory",
    });
  });

  it("replaces legacy memory-core compatibility names when MMV2 aliases are available", () => {
    const legacyMemorySearch = {
      name: "memory_search",
      description: "legacy memory-core",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "legacy" }] };
      },
    };
    const modelMemorySearch = {
      name: "model_memory_search",
      description: "search MMV2",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "mmv2" }] };
      },
    };
    hoisted.pluginToolMetaByTool.set(legacyMemorySearch, {
      pluginId: "memory-core",
      optional: true,
    });
    hoisted.pluginToolMetaByTool.set(modelMemorySearch, {
      pluginId: "model-memory",
      optional: true,
    });
    hoisted.resolvePluginTools.mockReturnValue([legacyMemorySearch, modelMemorySearch]);

    const tools = resolveOpenClawPluginToolsForOptions({
      options: { config: {} as OpenClawConfig },
      resolvedConfig: {} as OpenClawConfig,
    });

    const alias = tools.find((tool) => tool.name === "memory_search");
    expect(alias).toBeDefined();
    expect(alias?.description).toBe("search MMV2");
    expect(getPluginToolMeta(alias!)).toMatchObject({
      pluginId: "model-memory",
    });
  });

  it("keeps legacy memory_search when explicit fallback mode is enabled", () => {
    process.env.MODEL_MEMORY_LEGACY_MEMORY_TOOLS_ENABLED = "true";
    const legacyMemorySearch = {
      name: "memory_search",
      description: "legacy memory-core",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "legacy" }] };
      },
    };
    const modelMemorySearch = {
      name: "model_memory_search",
      description: "search MMV2",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "mmv2" }] };
      },
    };
    hoisted.pluginToolMetaByTool.set(legacyMemorySearch, {
      pluginId: "memory-core",
      optional: true,
    });
    hoisted.pluginToolMetaByTool.set(modelMemorySearch, {
      pluginId: "model-memory",
      optional: true,
    });
    hoisted.resolvePluginTools.mockReturnValue([legacyMemorySearch, modelMemorySearch]);

    const tools = resolveOpenClawPluginToolsForOptions({
      options: { config: {} as OpenClawConfig },
      resolvedConfig: {} as OpenClawConfig,
    });

    expect(tools.find((tool) => tool.name === "memory_search")?.description).toBe(
      "legacy memory-core",
    );
  });
});
