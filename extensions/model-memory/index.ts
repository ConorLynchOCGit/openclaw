import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createModelMemoryPluginConfigSchema } from "./src/config.js";
import { createModelMemoryDocumentIngestionTool } from "./src/document-ingestion-tool.js";
import { createModelMemoryGetTool, createModelMemorySearchTool } from "./src/read-tools.js";

const plugin = {
  id: "model-memory",
  name: "Model Memory",
  description: "Clean-room model-memory runtime and operator surfaces",
  configSchema: createModelMemoryPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createModelMemoryDocumentIngestionTool(api, ctx);
      },
      {
        names: [
          "model_memory_document_ingest",
          "model_memory_ingest_document",
          "ingest_document_into_model_memory",
        ],
        optional: true,
      },
    );
    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createModelMemorySearchTool(api);
      },
      {
        names: ["model_memory_search", "search_model_memory", "mmv2_memory_search"],
        optional: true,
      },
    );
    api.registerTool(
      (ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createModelMemoryGetTool(api);
      },
      {
        names: ["model_memory_get", "get_model_memory", "mmv2_memory_get"],
        optional: true,
      },
    );
  },
};

export default plugin;
