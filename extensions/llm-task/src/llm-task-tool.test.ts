import { describe, it, expect, vi, beforeEach } from "vitest";

const simpleCompletionMocks = vi.hoisted(() => ({
  prepareSimpleCompletionModel: vi.fn(),
  completeWithPreparedSimpleCompletionModel: vi.fn(),
  extractAssistantText: vi.fn(),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Object: (schema: unknown) => schema,
    String: (schema?: unknown) => schema,
    Optional: (schema: unknown) => schema,
    Unknown: (schema?: unknown) => schema,
    Number: (schema?: unknown) => schema,
  },
}));

vi.mock("ajv", () => ({
  default: class MockAjv {
    compile(schema: unknown) {
      return (value: unknown) => {
        if (
          schema &&
          typeof schema === "object" &&
          !Array.isArray(schema) &&
          (schema as { properties?: Record<string, { type?: string }> }).properties?.foo?.type ===
            "string"
        ) {
          const ok = typeof (value as { foo?: unknown })?.foo === "string";
          (this as { errors?: Array<{ instancePath: string; message: string }> }).errors = ok
            ? undefined
            : [{ instancePath: "/foo", message: "must be string" }];
          return ok;
        }
        (this as { errors?: Array<{ instancePath: string; message: string }> }).errors = undefined;
        return true;
      };
    }

    errors?: Array<{ instancePath: string; message: string }>;
  },
}));

vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  return {
    ...actual,
    supportsXHighThinking: () => false,
  };
});

vi.mock("openclaw/plugin-sdk/simple-completion-runtime", () => ({
  prepareSimpleCompletionModel: simpleCompletionMocks.prepareSimpleCompletionModel,
  completeWithPreparedSimpleCompletionModel:
    simpleCompletionMocks.completeWithPreparedSimpleCompletionModel,
  extractAssistantText: simpleCompletionMocks.extractAssistantText,
}));

import { createLlmTaskTool } from "./llm-task-tool.js";

function fakeApi(overrides: any = {}) {
  return {
    id: "llm-task",
    name: "llm-task",
    source: "test",
    config: {
      agents: { defaults: { workspace: "/tmp", model: { primary: "openai-codex/gpt-5.2" } } },
    },
    pluginConfig: {},
    runtime: { version: "test" },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registerTool() {},
    ...overrides,
  };
}

function mockCompletionJson(payload: unknown) {
  simpleCompletionMocks.extractAssistantText.mockReturnValueOnce(JSON.stringify(payload));
}

async function executeCompletion(input: Record<string, unknown>) {
  const tool = createLlmTaskTool(fakeApi());
  await tool.execute("id", input);
  return {
    prepared: simpleCompletionMocks.prepareSimpleCompletionModel.mock.calls[0]?.[0],
    completion: simpleCompletionMocks.completeWithPreparedSimpleCompletionModel.mock.calls[0]?.[0],
  };
}

describe("llm-task tool (json-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simpleCompletionMocks.prepareSimpleCompletionModel.mockResolvedValue({
      model: { provider: "openai-codex", model: "gpt-5.2" },
      auth: { apiKey: "test-key", mode: "env" },
    });
    simpleCompletionMocks.completeWithPreparedSimpleCompletionModel.mockResolvedValue({});
    simpleCompletionMocks.extractAssistantText.mockReturnValue("{}");
  });

  it("returns parsed json", async () => {
    mockCompletionJson({ foo: "bar" });
    const tool = createLlmTaskTool(fakeApi());
    const res = await tool.execute("id", { prompt: "return foo" });
    expect((res as any).details.json).toEqual({ foo: "bar" });
  });

  it("strips fenced json", async () => {
    simpleCompletionMocks.extractAssistantText.mockReturnValueOnce('```json\n{"ok":true}\n```');
    const tool = createLlmTaskTool(fakeApi());
    const res = await tool.execute("id", { prompt: "return ok" });
    expect((res as any).details.json).toEqual({ ok: true });
  });

  it("validates schema", async () => {
    mockCompletionJson({ foo: "bar" });
    const tool = createLlmTaskTool(fakeApi());
    const schema = {
      type: "object",
      properties: { foo: { type: "string" } },
      required: ["foo"],
      additionalProperties: false,
    };
    const res = await tool.execute("id", { prompt: "return foo", schema });
    expect((res as any).details.json).toEqual({ foo: "bar" });
  });

  it("throws on invalid json", async () => {
    simpleCompletionMocks.extractAssistantText.mockReturnValueOnce("not-json");
    const tool = createLlmTaskTool(fakeApi());
    await expect(tool.execute("id", { prompt: "x" })).rejects.toThrow(/invalid json/i);
  });

  it("throws on schema mismatch", async () => {
    mockCompletionJson({ foo: 1 });
    const tool = createLlmTaskTool(fakeApi());
    const schema = { type: "object", properties: { foo: { type: "string" } }, required: ["foo"] };
    await expect(tool.execute("id", { prompt: "x", schema })).rejects.toThrow(/match schema/i);
  });

  it("passes provider/model overrides to simple completion", async () => {
    mockCompletionJson({ ok: true });
    const call = await executeCompletion({
      prompt: "x",
      provider: "anthropic",
      model: "claude-4-sonnet",
    });
    expect(call.prepared.provider).toBe("anthropic");
    expect(call.prepared.modelId).toBe("claude-4-sonnet");
  });

  it("passes maxTokens override to simple completion", async () => {
    mockCompletionJson({ ok: true });
    const call = await executeCompletion({ prompt: "x", maxTokens: 77 });
    expect(call.completion.options.maxTokens).toBe(77);
  });

  it("normalizes thinking aliases", async () => {
    mockCompletionJson({ ok: true });
    await executeCompletion({ prompt: "x", thinking: "on" });
    expect(simpleCompletionMocks.prepareSimpleCompletionModel).toHaveBeenCalledTimes(1);
  });

  it("throws on invalid thinking level", async () => {
    const tool = createLlmTaskTool(fakeApi());
    await expect(tool.execute("id", { prompt: "x", thinking: "banana" })).rejects.toThrow(
      /invalid thinking level/i,
    );
    expect(simpleCompletionMocks.prepareSimpleCompletionModel).not.toHaveBeenCalled();
  });

  it("throws on unsupported xhigh thinking level", async () => {
    const tool = createLlmTaskTool(fakeApi());
    await expect(tool.execute("id", { prompt: "x", thinking: "xhigh" })).rejects.toThrow(
      /only supported/i,
    );
  });

  it("enforces allowedModels", async () => {
    mockCompletionJson({ ok: true });
    const tool = createLlmTaskTool(
      fakeApi({ pluginConfig: { allowedModels: ["openai-codex/gpt-5.2"] } }),
    );
    await expect(
      tool.execute("id", { prompt: "x", provider: "anthropic", model: "claude-4-sonnet" }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("does not use embedded runner", async () => {
    mockCompletionJson({ ok: true });
    const tool = createLlmTaskTool(fakeApi());
    await tool.execute("id", { prompt: "x" });
    expect(simpleCompletionMocks.completeWithPreparedSimpleCompletionModel).toHaveBeenCalledTimes(
      1,
    );
  });
});
