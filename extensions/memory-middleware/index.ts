import {
  createMemoryMiddlewarePluginService,
  createMemoryMiddlewareRuntime,
  definePluginEntry,
  memoryMiddlewareConfigSchema,
  registerMemoryMiddlewareTools,
  type OpenClawPluginApi,
} from "./runtime-api.js";

export default definePluginEntry({
  id: "memory-middleware",
  name: "Memory Middleware",
  description: "Native scaffold for future candidate-only memory middleware work.",
  configSchema: memoryMiddlewareConfigSchema,
  register(api: OpenClawPluginApi) {
    const runtime = createMemoryMiddlewareRuntime(api);

    registerMemoryMiddlewareTools(api, runtime);
    api.registerService(
      createMemoryMiddlewarePluginService(
        runtime,
        api.runtime?.events?.onSessionTranscriptUpdate?.bind(api.runtime.events),
      ),
    );
  },
});
