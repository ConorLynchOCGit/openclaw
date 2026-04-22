import { describe, expect, it } from "vitest";
import { resolveModelMemoryStorageEngine } from "./storage-engine.ts";

describe("resolveModelMemoryStorageEngine", () => {
  it("defaults to mmv2", () => {
    expect(resolveModelMemoryStorageEngine(undefined, {} as NodeJS.ProcessEnv)).toBe("mmv2");
  });

  it("allows explicit legacy fallback", () => {
    expect(
      resolveModelMemoryStorageEngine(undefined, {
        MODEL_MEMORY_STORAGE_ENGINE: "legacy",
      } as NodeJS.ProcessEnv),
    ).toBe("legacy");
  });
});
