import { describe, expect, it, vi } from "vitest";
import { createCapturedPluginRegistration } from "../../src/test-utils/plugin-registration.ts";
import plugin from "./index.ts";

describe("model-memory plugin registration", () => {
  it("registers the document-ingestion operator tool as an optional plugin tool", () => {
    const registerTool = vi.fn();
    const captured = createCapturedPluginRegistration();

    plugin.register?.({
      ...captured.api,
      config: {},
      registerTool,
    });

    expect(registerTool).toHaveBeenCalledTimes(3);
    expect(registerTool.mock.calls.map((call) => call[1].names[0])).toEqual([
      "model_memory_document_ingest",
      "model_memory_search",
      "model_memory_get",
    ]);
    expect(registerTool.mock.calls[0]?.[1]).toMatchObject({
      names: [
        "model_memory_document_ingest",
        "model_memory_ingest_document",
        "ingest_document_into_model_memory",
      ],
      optional: true,
    });

    const toolFactory = registerTool.mock.calls[0]?.[0];
    const tool = toolFactory({
      config: {},
      workspaceDir: "/tmp/workspace",
      sandboxed: false,
    });
    expect(tool).toMatchObject({
      name: "model_memory_document_ingest",
      label: "Model Memory Document Ingest",
    });

    const sandboxedTool = toolFactory({
      config: {},
      workspaceDir: "/tmp/workspace",
      sandboxed: true,
    });
    expect(sandboxedTool).toBeNull();
  });
});
