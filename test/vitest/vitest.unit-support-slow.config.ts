import { createUnitVitestConfigWithOptions } from "./vitest.unit.config.ts";

export default createUnitVitestConfigWithOptions(process.env, {
  name: "unit-support-slow",
  includePatterns: ["packages/memory-host-sdk/src/host/embeddings-ollama.test.ts"],
});
