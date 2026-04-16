import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createModelMemoryPluginConfigSchema } from "./src/config.js";
import { createModelMemoryDocumentIngestionTool } from "./src/document-ingestion-tool.js";

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
  },
};

export default plugin;
