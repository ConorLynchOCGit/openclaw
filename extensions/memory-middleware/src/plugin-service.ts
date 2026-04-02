import type { OpenClawPluginService } from "../api.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";

export function createMemoryMiddlewarePluginService(
  runtime: MemoryMiddlewareRuntime,
): OpenClawPluginService {
  return {
    id: "memory-middleware-base",
    async start() {
      // The base scaffold intentionally stays inert until the middleware tools and
      // database-backed flows are implemented in later slices.
      void runtime;
    },
    async stop() {
      void runtime;
    },
  };
}
